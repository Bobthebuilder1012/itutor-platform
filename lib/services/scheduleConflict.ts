// Child-side schedule conflict check. Given a studentId (the child) and a
// proposed [start, end) window, returns the first overlapping commitment on
// THAT student's own schedule — across 1:1 sessions and enrolled group
// occurrences — or null. This is intentionally NOT about tutor over-booking.
//
// Overlap test: existing.start < proposed.end AND existing.end > proposed.start.

import { getServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof getServiceClient>;

export type ScheduleConflict = { type: 'one_on_one' | 'group'; label: string; start: string; end: string };

export async function findChildScheduleConflict(
  admin: ServiceClient,
  studentId: string,
  startISO: string,
  endISO: string
): Promise<ScheduleConflict | null> {
  // 1) Existing 1:1 scheduled sessions (non-cancelled)
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_start_at, scheduled_end_at')
    .eq('student_id', studentId)
    .is('cancelled_at', null)
    .lt('scheduled_start_at', endISO)
    .gt('scheduled_end_at', startISO)
    .limit(1);
  if (sessions && sessions.length) {
    const s = sessions[0];
    return { type: 'one_on_one', label: 'a 1:1 session', start: s.scheduled_start_at, end: s.scheduled_end_at };
  }

  // 2) Group occurrences for the child's enrolled groups.
  //    Join: memberships → groups → group_sessions → group_session_occurrences.
  const groupIds = await childGroupIds(admin, studentId);
  if (groupIds.length === 0) return null;

  const { data: gs } = await admin.from('group_sessions').select('id, group_id').in('group_id', groupIds);
  const sessionIds = (gs ?? []).map((g) => g.id);
  if (sessionIds.length === 0) return null;
  const groupOfSession = new Map((gs ?? []).map((g) => [g.id, g.group_id]));

  const { data: occ } = await admin
    .from('group_session_occurrences')
    .select('id, group_session_id, scheduled_start_at, scheduled_end_at')
    .in('group_session_id', sessionIds)
    .eq('is_cancelled', false)
    .lt('scheduled_start_at', endISO)
    .gt('scheduled_end_at', startISO)
    .limit(1);
  if (occ && occ.length) {
    const o = occ[0];
    const gId = groupOfSession.get(o.group_session_id);
    let label = 'a group class';
    if (gId) {
      const { data: g } = await admin.from('groups').select('name').eq('id', gId).maybeSingle();
      if (g?.name) label = g.name;
    }
    return { type: 'group', label, start: o.scheduled_start_at, end: o.scheduled_end_at };
  }

  return null;
}

async function childGroupIds(admin: ServiceClient, studentId: string): Promise<string[]> {
  const [{ data: mems }, { data: enrolls }] = await Promise.all([
    admin.from('group_members').select('group_id').eq('user_id', studentId).in('status', ['approved', 'active']),
    admin.from('group_enrollments').select('group_id').eq('student_id', studentId).in('status', ['ACTIVE', 'GRACE']),
  ]);
  const ids = new Set<string>();
  (mems ?? []).forEach((m: any) => m.group_id && ids.add(m.group_id));
  (enrolls ?? []).forEach((e: any) => e.group_id && ids.add(e.group_id));
  return [...ids];
}

// Human-readable 409 message for a blocked booking/enrolment.
export function conflictMessage(c: ScheduleConflict): string {
  const when = new Date(c.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `That time clashes with ${c.label} already on this student's schedule (${when}). Pick a different slot.`;
}
