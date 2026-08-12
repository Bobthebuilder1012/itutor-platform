import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Enrolment statuses that occupy a seat.
 *
 * Mirrors GET /api/groups/member-counts, which is what feeds the "3/15" the
 * tutor reads on the class header — a capacity floor computed from a different
 * set would contradict the number on screen. SECURED counts: a preordered seat
 * is paid for and held.
 */
const OCCUPYING_ENROLMENT_STATUSES = ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'];
const OCCUPYING_MEMBER_STATUSES = ['active', 'approved'];

/**
 * How many students currently hold a seat in a class.
 *
 * Counted across both tables a class can be joined through — `group_enrollments`
 * (paid/subscription) and `group_members` (direct/free) — and de-duplicated by
 * student, because a student present in both would otherwise be counted twice
 * and could push a class over a limit it hasn't actually reached.
 *
 * Must be called with the SERVICE client: both tables are RLS-restricted, and
 * group_members' policy self-references (42P17) for non-members.
 */
export async function classOccupancy(admin: SupabaseClient, groupId: string): Promise<number> {
  const [{ data: enrolments, error: eErr }, { data: members, error: mErr }] = await Promise.all([
    admin
      .from('group_enrollments')
      .select('student_id')
      .eq('group_id', groupId)
      .in('status', OCCUPYING_ENROLMENT_STATUSES),
    admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .in('status', OCCUPYING_MEMBER_STATUSES),
  ]);

  // Surface the failure rather than reporting an empty class: a silent 0 here
  // would let a capacity floor be bypassed entirely.
  if (eErr || mErr) {
    throw new Error(`Could not read class enrolment: ${eErr?.message ?? mErr?.message}`);
  }

  const students = new Set<string>();
  for (const row of enrolments ?? []) if (row.student_id) students.add(row.student_id as string);
  for (const row of members ?? []) if (row.user_id) students.add(row.user_id as string);
  return students.size;
}
