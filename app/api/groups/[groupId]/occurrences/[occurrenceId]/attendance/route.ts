// GET  — the register for one session, with the join log already resolved.
// POST — save the tutor's marks.
//
// §6 of the physical-classes spec. The tutor is standing in a room with a
// phone, so the shape here is chosen for that: one round trip to load, one to
// save, no per-tap writes.
//
// ── STUDENTS ARE GROUPED BY EVIDENCE, NOT BY SEAT ──────────────────────────
// `group_enrollments.seat_type` is what someone BOUGHT. `attendance_mode` is
// what happened this week. A physical-seat student who joined the call appears
// under Online for that session, flagged so the tutor can see the mismatch —
// and keeps their physical seat. Nothing needs approving; it is a fact about
// one session, not a change of plan.
//
// ── THE ONLINE HALF IS PRE-FILLED, THE IN-PERSON HALF IS BLANK ─────────────
// `session_attendance_log` rows written by the student's own Join click are
// evidence the tutor did not have to gather, so they arrive already marked. A
// room cannot be pre-filled by anything, so those rows start empty and the
// tutor marks them.
//
// When a tutor's mark CONTRADICTS the join log — absent, despite a recorded
// join — a note is captured. That is the one case where the two sources
// disagree, and overwriting silently would destroy the only evidence the
// student has if they query it later.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string; occurrenceId: string }> };

/** The register's vocabulary, matching session_attendance_log's CHECK. */
const MARKS = ['attended', 'late', 'absent'] as const;
type Mark = (typeof MARKS)[number];

async function requireTutorOfClass(groupId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) } as const;
  }

  const admin = getServiceClient();
  const { data: group } = await admin
    .from('groups')
    .select('id, tutor_id, name, class_format')
    .eq('id', groupId)
    .maybeSingle();

  // Same answer for "not yours" and "does not exist", so this cannot be used to
  // enumerate class ids.
  if (!group || (group as any).tutor_id !== user.id) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }

  return { admin, userId: user.id, group: group as any } as const;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { groupId, occurrenceId } = await params;
  const auth = await requireTutorOfClass(groupId);
  if ('error' in auth) return auth.error;
  const { admin, group } = auth;

  const { data: occurrence } = await admin
    .from('group_session_occurrences')
    .select('id, scheduled_start_at, scheduled_end_at, status, cancelled_at')
    .eq('id', occurrenceId)
    .maybeSingle();

  if (!occurrence) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // The roll. Both tables a class can be joined through, so nobody is missing
  // from the register because of how they got in.
  const [{ data: enrolments }, { data: members }] = await Promise.all([
    admin
      .from('group_enrollments')
      .select('student_id, seat_type, status')
      .eq('group_id', groupId)
      .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']),
    admin
      .from('group_members')
      .select('user_id, status')
      .eq('group_id', groupId)
      .in('status', ['active', 'approved']),
  ]);

  const seatByStudent = new Map<string, 'online' | 'physical'>();
  for (const row of (enrolments ?? []) as Array<{ student_id: string; seat_type?: string | null }>) {
    seatByStudent.set(row.student_id, row.seat_type === 'physical' ? 'physical' : 'online');
  }
  for (const row of (members ?? []) as Array<{ user_id: string }>) {
    // A member row carries no seat type; before 242 every class was online.
    if (!seatByStudent.has(row.user_id)) seatByStudent.set(row.user_id, 'online');
  }

  const studentIds = Array.from(seatByStudent.keys());
  if (studentIds.length === 0) {
    return NextResponse.json({ occurrence, group, students: [] });
  }

  const [{ data: profiles }, { data: logs }] = await Promise.all([
    admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', studentIds),
    admin
      .from('session_attendance_log')
      .select('student_id, status, joined_at, attendance_mode, marked_by, note, late_minutes')
      .eq('occurrence_id', occurrenceId)
      .in('student_id', studentIds),
  ]);

  const logByStudent = new Map<string, any>();
  for (const l of (logs ?? []) as any[]) logByStudent.set(l.student_id, l);

  const students = ((profiles ?? []) as any[])
    .map((p) => {
      const log = logByStudent.get(p.id) ?? null;
      const joined = Boolean(log?.joined_at);
      return {
        student_id: p.id,
        name: p.display_name || p.full_name || 'Student',
        avatar_url: p.avatar_url ?? null,
        /** What they bought. */
        seat_type: seatByStudent.get(p.id) ?? 'online',
        /**
         * Which half of the sheet they belong under. Evidence first: a join
         * click puts them under Online whatever seat they hold.
         */
        mode: (log?.attendance_mode as string | null) ?? (joined ? 'online' : null),
        /** Pre-filled from the join click; null for a room, which cannot be. */
        status: (log?.status as Mark | null) ?? (joined ? 'attended' : null),
        joined_at: log?.joined_at ?? null,
        late_minutes: log?.late_minutes ?? null,
        note: log?.note ?? null,
        /** True once a human has saved this row, as opposed to it being derived. */
        marked: Boolean(log?.marked_by),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ occurrence, group, students });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { groupId, occurrenceId } = await params;
  const auth = await requireTutorOfClass(groupId);
  if ('error' in auth) return auth.error;
  const { admin, userId } = auth;

  let body: { marks?: Array<{ student_id: string; status: string; mode?: string; note?: string }> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const marks = Array.isArray(body.marks) ? body.marks : [];
  if (marks.length === 0) return NextResponse.json({ saved: 0 });

  const nowIso = new Date().toISOString();

  const rows = marks
    .filter((m) => m && typeof m.student_id === 'string' && MARKS.includes(m.status as Mark))
    .map((m) => ({
      student_id: m.student_id,
      // The register is for group classes; the log serves 1:1 sessions too, and
      // this discriminator is what keeps the UNIQUE key from colliding.
      occurrence_type: 'group_occurrence' as const,
      occurrence_id: occurrenceId,
      group_id: groupId,
      status: m.status,
      attendance_mode: m.mode === 'in_person' ? 'in_person' : 'online',
      note: typeof m.note === 'string' && m.note.trim() ? m.note.trim().slice(0, 500) : null,
      marked_by: userId,
      marked_at: nowIso,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_valid_marks' }, { status: 400 });
  }

  // Upsert on the log's natural key so a tutor can correct a sheet by saving it
  // again. `joined_at` is deliberately absent from the payload: it records when
  // the STUDENT clicked, and a tutor's later mark must not overwrite the
  // student's own evidence — which is the whole reason a contradiction can be
  // shown at all.
  const { error } = await admin
    .from('session_attendance_log')
    .upsert(rows, { onConflict: 'student_id,occurrence_type,occurrence_id' });

  if (error) {
    console.error('[attendance] save failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }

  return NextResponse.json({ saved: rows.length });
}
