// =====================================================
// GET /api/cron/backfill-retention
// =====================================================
// Find Your iTutor Build Plan §2.5: "Backfill retained_30d as a cron job
// alongside the existing nine. Uses group_attendance_records — a student counts
// as retained if they attended at least one session in days 23-30 after first
// payment."
//
// retained_30d is the north-star input (plan §8: "campaign-attributed students
// paid and active at 30 days"), so this job is deliberately idempotent: it
// records every verdict in retention_marks and never re-emits an event for a
// pair it has already judged.
//
// Headers: Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The retention window, in days after first payment. Plan §2.5. */
const WINDOW_OPEN_DAY = 23;
const WINDOW_CLOSE_DAY = 30;

/**
 * How far back to look for pairs whose window has just closed. The window shuts
 * at day 30; this job re-checks up to day 60 so a few missed nightly runs (or a
 * deploy freeze) do not permanently lose a cohort.
 */
const LOOKBACK_DAY = 60;

/** Attendance statuses that count as having shown up. */
const PRESENT_STATUSES = ['PRESENT', 'LATE'];

interface PaidEnrolment {
  student_id: string;
  group_id: string;
  enrolled_at: string;
}

interface AttendanceLogRow {
  student_id: string;
  group_id: string | null;
  joined_at: string;
}

/**
 * Is this error "the table is not in this database" rather than a real fault?
 *
 * Distinguished so a genuinely broken query still fails loudly. 42P01 is an
 * undefined relation; PGRST205 is PostgREST refusing to route to a table it
 * cannot find in its schema cache.
 */
function isMissingRelation(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
}

interface AttendanceJoin {
  student_id: string;
  status: string;
  group_session_occurrences: {
    scheduled_start_at: string;
    group_sessions: { group_id: string } | null;
  } | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceClient();
  const now = Date.now();

  // 1) Candidate pairs: a paid enrolment old enough that the day-30 window has
  //    closed, but not so old that it predates this job's useful history.
  const windowClosedBefore = new Date(now - WINDOW_CLOSE_DAY * DAY_MS).toISOString();
  const lookbackAfter = new Date(now - LOOKBACK_DAY * DAY_MS).toISOString();

  const { data: candidateRows, error: candidateError } = await service
    .from('group_enrollments')
    .select('student_id, group_id, enrolled_at')
    .eq('payment_status', 'PAID')
    .gte('enrolled_at', lookbackAfter)
    .lte('enrolled_at', windowClosedBefore);

  if (candidateError) {
    console.error('[backfill-retention] candidate query failed:', candidateError.message);
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  const candidates = (candidateRows ?? []) as PaidEnrolment[];
  if (candidates.length === 0) {
    return NextResponse.json({ evaluated: 0, retained: 0, skipped: 0 });
  }

  const studentIds = Array.from(new Set(candidates.map(c => c.student_id)));

  // 2) The true first payment per (student, group). A student who re-enrolled
  //    would otherwise have their later enrolment treated as day zero, which
  //    would measure the wrong 30 days entirely.
  const { data: allPaidRows, error: allPaidError } = await service
    .from('group_enrollments')
    .select('student_id, group_id, enrolled_at')
    .eq('payment_status', 'PAID')
    .in('student_id', studentIds);

  if (allPaidError) {
    console.error('[backfill-retention] history query failed:', allPaidError.message);
    return NextResponse.json({ error: allPaidError.message }, { status: 500 });
  }

  const firstPaidByPair = new Map<string, number>();
  for (const row of (allPaidRows ?? []) as PaidEnrolment[]) {
    const key = `${row.student_id}:${row.group_id}`;
    const at = Date.parse(row.enrolled_at);
    if (!Number.isFinite(at)) continue;
    const existing = firstPaidByPair.get(key);
    if (existing === undefined || at < existing) firstPaidByPair.set(key, at);
  }

  // 3) Drop pairs already judged. retention_marks is what makes the job safe to
  //    run nightly.
  const { data: markedRows } = await service
    .from('retention_marks')
    .select('student_id, group_id')
    .in('student_id', studentIds);

  const alreadyMarked = new Set(
    ((markedRows ?? []) as Array<{ student_id: string; group_id: string }>).map(
      r => `${r.student_id}:${r.group_id}`
    )
  );

  const pending: Array<{ studentId: string; groupId: string; firstPaidAt: number }> = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = `${candidate.student_id}:${candidate.group_id}`;
    if (seen.has(key) || alreadyMarked.has(key)) continue;

    const firstPaidAt = firstPaidByPair.get(key);
    if (firstPaidAt === undefined) continue;

    // Only judge once the window has actually closed for the FIRST payment.
    if (now - firstPaidAt < WINDOW_CLOSE_DAY * DAY_MS) continue;

    seen.add(key);
    pending.push({ studentId: candidate.student_id, groupId: candidate.group_id, firstPaidAt });
  }

  if (pending.length === 0) {
    return NextResponse.json({ evaluated: 0, retained: 0, skipped: candidates.length });
  }

  // 4) Attendance for these students across the whole span under evaluation,
  //    resolved to a group via occurrence -> session -> group.
  const spanStart = new Date(
    Math.min(...pending.map(p => p.firstPaidAt)) + WINDOW_OPEN_DAY * DAY_MS
  ).toISOString();
  const spanEnd = new Date(
    Math.max(...pending.map(p => p.firstPaidAt)) + WINDOW_CLOSE_DAY * DAY_MS
  ).toISOString();

  const pendingStudentIds = Array.from(new Set(pending.map(p => p.studentId)));

  // student:group -> attended timestamps, so each pair is judged against its
  // own window rather than the span shared by the whole batch.
  const attendedByPair = new Map<string, number[]>();
  const addAttendance = (studentId: string, groupId: string, at: number) => {
    const key = `${studentId}:${groupId}`;
    const list = attendedByPair.get(key);
    if (list) list.push(at);
    else attendedByPair.set(key, [at]);
  };

  // TWO SOURCES, BECAUSE THE ENVIRONMENTS DISAGREE ABOUT WHICH TABLE EXISTS.
  //
  // The build plan names `group_attendance_records`. That table is absent from
  // staging entirely; what staging has is `session_attendance_log` (migration
  // 196), the row the student's own "Join" click writes. Querying only the
  // former made this job return 500 on every run on the environment it was
  // meant to be proven on, which is why it was never registered as a cron.
  //
  // Both are read and their timestamps unioned. They measure slightly different
  // things — the log is self-reported presence, the records table is the
  // tutor's register — and for a binary "did this student show up at all in
  // days 23-30" either is sufficient evidence. Taking the union means a class
  // whose tutor never marks a register still counts its students as retained.
  let sourcesRead = 0;

  // Source 1: session_attendance_log. group_id is on the row, so no join, and
  // joined_at is already the moment of attendance.
  const { data: logRows, error: logError } = await service
    .from('session_attendance_log')
    .select('student_id, group_id, joined_at')
    .in('student_id', pendingStudentIds)
    .gte('joined_at', spanStart)
    .lte('joined_at', spanEnd);

  if (logError) {
    if (isMissingRelation(logError)) {
      console.warn('[backfill-retention] session_attendance_log absent — skipping source.');
    } else {
      console.error('[backfill-retention] attendance log query failed:', logError.message);
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }
  } else {
    sourcesRead += 1;
    for (const row of (logRows ?? []) as AttendanceLogRow[]) {
      if (!row.group_id) continue;
      const at = Date.parse(row.joined_at);
      if (!Number.isFinite(at)) continue;
      addAttendance(row.student_id, row.group_id, at);
    }
  }

  // Source 2: group_attendance_records, resolved to a group via
  // occurrence -> session -> group.
  const { data: attendanceRows, error: attendanceError } = await service
    .from('group_attendance_records')
    .select(
      'student_id, status, group_session_occurrences!inner(scheduled_start_at, group_sessions!inner(group_id))'
    )
    .in('student_id', pendingStudentIds)
    .in('status', PRESENT_STATUSES)
    .gte('group_session_occurrences.scheduled_start_at', spanStart)
    .lte('group_session_occurrences.scheduled_start_at', spanEnd);

  if (attendanceError) {
    if (isMissingRelation(attendanceError)) {
      console.warn('[backfill-retention] group_attendance_records absent — skipping source.');
    } else {
      console.error('[backfill-retention] attendance query failed:', attendanceError.message);
      return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    }
  } else {
    sourcesRead += 1;
    for (const row of (attendanceRows ?? []) as unknown as AttendanceJoin[]) {
      const occurrence = row.group_session_occurrences;
      const groupId = occurrence?.group_sessions?.group_id;
      if (!occurrence || !groupId) continue;
      const at = Date.parse(occurrence.scheduled_start_at);
      if (!Number.isFinite(at)) continue;
      addAttendance(row.student_id, groupId, at);
    }
  }

  // NEITHER SOURCE READABLE: STOP, DO NOT MARK.
  //
  // This is the one failure that must not degrade gracefully. Every verdict is
  // written to retention_marks and never re-judged, so proceeding with no
  // attendance data would permanently record the entire cohort as churned — a
  // wrong north-star number that no later run can correct, because the pairs
  // are marked. A 500 here is recoverable; a silent false is not.
  if (sourcesRead === 0) {
    console.error('[backfill-retention] no attendance source readable — refusing to mark.');
    return NextResponse.json(
      { error: 'no_attendance_source', evaluated: 0 },
      { status: 500 }
    );
  }

  const marks: Array<{
    student_id: string;
    group_id: string;
    first_paid_at: string;
    retained: boolean;
  }> = [];
  const retainedPairs: Array<{ studentId: string; groupId: string }> = [];

  for (const pair of pending) {
    const open = pair.firstPaidAt + WINDOW_OPEN_DAY * DAY_MS;
    const close = pair.firstPaidAt + WINDOW_CLOSE_DAY * DAY_MS;
    const attended = attendedByPair.get(`${pair.studentId}:${pair.groupId}`) ?? [];
    const retained = attended.some(at => at >= open && at <= close);

    marks.push({
      student_id: pair.studentId,
      group_id: pair.groupId,
      first_paid_at: new Date(pair.firstPaidAt).toISOString(),
      retained,
    });

    if (retained) retainedPairs.push({ studentId: pair.studentId, groupId: pair.groupId });
  }

  // 5) Record verdicts first, then emit events. If the event insert fails the
  //    verdict still stands and is not re-judged; the alternative ordering could
  //    emit an event twice, which would overstate retention.
  const { error: markError } = await service
    .from('retention_marks')
    .upsert(marks, { onConflict: 'student_id,group_id' });

  if (markError) {
    console.error('[backfill-retention] mark upsert failed:', markError.message);
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  if (retainedPairs.length > 0) {
    const { error: eventError } = await service.from('product_events').insert(
      retainedPairs.map(pair => ({
        user_id: pair.studentId,
        anon_id: null,
        event: PRODUCT_EVENTS.RETAINED_30D,
        props: { group_id: pair.groupId },
        // Attribution is carried on the earlier funnel events for this user;
        // this row is a server-side fact with no request cookie behind it.
        attribution: null,
      }))
    );

    if (eventError) {
      console.error('[backfill-retention] event insert failed:', eventError.message);
    }
  }

  return NextResponse.json({
    evaluated: marks.length,
    retained: retainedPairs.length,
    skipped: candidates.length - marks.length,
  });
}
