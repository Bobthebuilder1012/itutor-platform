// Attendance: the single place the rules live.
//
// Handover §6 and decisions 16/17: attendance is derived from the join click,
// automatic, and editable by nobody. Migration 218 makes that true at the
// database level (read-only for every user role, service-role writes only).
// This module is the other half — it decides whether a join event is real, and
// what status and rate follow from it.
//
// §6 is explicit that there must be ONE rate helper, called by the tutor
// roster, the student class view, the parent child view and the family
// calendar: "Independent implementations are how the numbers start
// disagreeing." So `attendanceRate` and `formatAttendanceRate` live here and
// nowhere else, and every surface that prints a percentage imports them.
//
// Server-only: it takes a service-role Supabase client. Do not import into a
// client component.

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/** Join opens this many minutes before the scheduled start. */
export const JOIN_WINDOW_OPENS_MINUTES = 30;

/** Join closes this many minutes after the scheduled end. */
export const JOIN_WINDOW_CLOSES_MINUTES = 15;

/**
 * Grace after the scheduled start that still counts as on time. §6 defines
 * `late` as a join click "after session start"; a bare zero-second boundary
 * would make a student who joined as the tutor said hello permanently late, so
 * the product tolerance is stated once, here.
 */
export const ON_TIME_GRACE_MINUTES = 5;

const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type AttendanceStatus = 'attended' | 'late' | 'absent' | 'cancelled';

export type DerivedAttendance = {
  status: 'attended' | 'late';
  /** Whole minutes late, null when on time. §6: late_minutes = join − start. */
  lateMinutes: number | null;
};

/**
 * The only place a join timestamp becomes a status.
 *
 * `absent` is never returned: absence is the *absence of a row* (mig 196), not a
 * value anyone writes. `cancelled` is a property of the session, not of a
 * student, so it is not derivable from a join either.
 */
export function deriveAttendanceStatus(params: {
  joinedAt: Date | string;
  scheduledStart: Date | string;
}): DerivedAttendance {
  const joined = new Date(params.joinedAt).getTime();
  const start = new Date(params.scheduledStart).getTime();

  if (!Number.isFinite(joined) || !Number.isFinite(start)) {
    return { status: 'attended', lateMinutes: null };
  }

  const deltaMs = joined - start;
  if (deltaMs <= ON_TIME_GRACE_MINUTES * MINUTE_MS) {
    return { status: 'attended', lateMinutes: null };
  }
  return { status: 'late', lateMinutes: Math.max(1, Math.round(deltaMs / MINUTE_MS)) };
}

// ---------------------------------------------------------------------------
// Rates — §6, one implementation
// ---------------------------------------------------------------------------

export type AttendanceTally = {
  attended: number;
  late: number;
  absent: number;
  /** Excluded from every rate. */
  cancelled: number;
};

export type AttendanceRate = {
  /** Percent 0–100, or null when nothing has been counted yet. */
  rate: number | null;
  /** The denominator. Never print `rate` without it. */
  counted: number;
};

export function emptyTally(): AttendanceTally {
  return { attended: 0, late: 0, absent: 0, cancelled: 0 };
}

/**
 * rate = (attended + late) / (attended + late + absent)
 *
 * Cancelled sessions are excluded, per §6 — a class the tutor called off is not
 * a student's failure to turn up. Turning up late still counts as turning up,
 * which is why `late` sits in the numerator; the lateness is reported
 * separately rather than by docking the rate twice.
 */
export function attendanceRate(tally: AttendanceTally): AttendanceRate {
  const counted = tally.attended + tally.late + tally.absent;
  if (counted === 0) return { rate: null, counted: 0 };
  return {
    rate: Math.round(((tally.attended + tally.late) / counted) * 100),
    counted,
  };
}

/**
 * "92% of 12 sessions". §6: always render the denominator, never a bare figure.
 * A lone "92%" invites a parent to read it as 92% of a term.
 */
export function formatAttendanceRate(tally: AttendanceTally): string {
  const { rate, counted } = attendanceRate(tally);
  if (rate === null) return 'No sessions yet';
  return `${rate}% of ${counted} ${counted === 1 ? 'session' : 'sessions'}`;
}

export function tallyFromStatuses(statuses: Iterable<AttendanceStatus>): AttendanceTally {
  const tally = emptyTally();
  for (const s of statuses) {
    if (s in tally) tally[s] += 1;
  }
  return tally;
}

// ---------------------------------------------------------------------------
// Was this join event real?
// ---------------------------------------------------------------------------

export type JoinOccurrenceType = 'session' | 'group_occurrence';

export type JoinVerification =
  | {
      ok: true;
      groupId: string | null;
      scheduledStart: string;
      scheduledEnd: string | null;
    }
  | {
      ok: false;
      /** not_found | not_enrolled | cancelled | window_closed | window_not_open */
      reason: string;
    };

/** Active statuses on group_enrollments. SUSPENDED and CANCELLED cannot join. */
const ENROLLED_STATUSES = ['ACTIVE', 'GRACE', 'SECURED'];

/** Active statuses on the older group_members table. */
const MEMBER_STATUSES = ['active', 'approved', 'ACTIVE', 'APPROVED'];

function windowVerdict(
  scheduledStart: string,
  scheduledEnd: string | null,
  now: Date
): 'ok' | 'window_not_open' | 'window_closed' {
  const start = new Date(scheduledStart).getTime();
  if (!Number.isFinite(start)) return 'ok'; // nothing to judge against

  const opensAt = start - JOIN_WINDOW_OPENS_MINUTES * MINUTE_MS;
  const endMs = scheduledEnd ? new Date(scheduledEnd).getTime() : NaN;
  const closesAt =
    (Number.isFinite(endMs) ? endMs : start + 60 * MINUTE_MS) +
    JOIN_WINDOW_CLOSES_MINUTES * MINUTE_MS;

  const t = now.getTime();
  if (t < opensAt) return 'window_not_open';
  if (t > closesAt) return 'window_closed';
  return 'ok';
}

/**
 * Decides whether to believe a claimed join.
 *
 * Why this exists: /api/attendance/mark-present writes with the service role,
 * which bypasses RLS, and used to take `occurrenceId` from the request body on
 * trust. Locking the table down (mig 218) closes the direct-PostgREST hole but
 * not that endpoint — a student could still POST any occurrence id and be
 * marked Present for a class that ended last month, converting a recorded
 * absence into an attendance. Both halves are needed.
 *
 * Three things have to hold: the student is really on the roster, the session
 * was not cancelled, and it is happening roughly now.
 */
export async function verifyJoinEvent(
  admin: SupabaseClient,
  params: {
    studentId: string;
    occurrenceType: JoinOccurrenceType;
    occurrenceId: string;
    now?: Date;
  }
): Promise<JoinVerification> {
  const now = params.now ?? new Date();

  // ---- 1:1 ---------------------------------------------------------------
  if (params.occurrenceType === 'session') {
    const { data: session } = await admin
      .from('sessions')
      .select('id, student_id, scheduled_start_at, scheduled_end_at, status, cancelled_at')
      .eq('id', params.occurrenceId)
      .maybeSingle();

    if (!session) return { ok: false, reason: 'not_found' };
    // The session names its student, so this is the whole roster check.
    if (session.student_id !== params.studentId) return { ok: false, reason: 'not_enrolled' };
    if (session.cancelled_at || String(session.status ?? '').toUpperCase() === 'CANCELLED') {
      return { ok: false, reason: 'cancelled' };
    }

    const verdict = windowVerdict(session.scheduled_start_at, session.scheduled_end_at, now);
    if (verdict !== 'ok') return { ok: false, reason: verdict };

    return {
      ok: true,
      groupId: null,
      scheduledStart: session.scheduled_start_at,
      scheduledEnd: session.scheduled_end_at ?? null,
    };
  }

  // ---- group -------------------------------------------------------------
  const { data: occurrence } = await admin
    .from('group_session_occurrences')
    .select(
      'id, group_session_id, scheduled_start_at, scheduled_end_at, status, cancelled_at, group_sessions(group_id)'
    )
    .eq('id', params.occurrenceId)
    .maybeSingle();

  if (!occurrence) return { ok: false, reason: 'not_found' };
  if (occurrence.cancelled_at || String(occurrence.status ?? '').toUpperCase() === 'CANCELLED') {
    return { ok: false, reason: 'cancelled' };
  }

  const joined = occurrence.group_sessions as { group_id?: string } | Array<{ group_id?: string }> | null;
  const groupRef = Array.isArray(joined) ? joined[0] : joined;
  const groupId = groupRef?.group_id ?? null;
  if (!groupId) return { ok: false, reason: 'not_found' };

  const verdict = windowVerdict(occurrence.scheduled_start_at, occurrence.scheduled_end_at, now);
  if (verdict !== 'ok') return { ok: false, reason: verdict };

  const enrolled = await isEnrolledInGroup(admin, params.studentId, groupId);
  if (!enrolled) return { ok: false, reason: 'not_enrolled' };

  return {
    ok: true,
    groupId,
    scheduledStart: occurrence.scheduled_start_at,
    scheduledEnd: occurrence.scheduled_end_at ?? null,
  };
}

/**
 * Enrolment across both systems. group_enrollments is the current one;
 * group_members predates it and still holds rows on older classes, so a
 * student legitimately on an old roster is not turned away.
 */
export async function isEnrolledInGroup(
  admin: SupabaseClient,
  studentId: string,
  groupId: string
): Promise<boolean> {
  const { data: enrolment } = await admin
    .from('group_enrollments')
    .select('id')
    .eq('group_id', groupId)
    .eq('student_id', studentId)
    .in('status', ENROLLED_STATUSES)
    .limit(1);

  if (enrolment && enrolment.length > 0) return true;

  const { data: member } = await admin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', studentId)
    .in('status', MEMBER_STATUSES)
    .limit(1);

  return Boolean(member && member.length > 0);
}
