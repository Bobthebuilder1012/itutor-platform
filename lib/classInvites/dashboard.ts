/**
 * The one computation behind "3 / 5".
 *
 * §4's table and §5's persistent banner both read this. Two endpoints
 * computing the same number independently is two implementations that drift,
 * and the way they drift is a teacher seeing 3/5 on one screen and 4/5 on the
 * next — which destroys trust in the only number this feature exists to move.
 *
 * Batched deliberately. The naive shape is a query per invitation; a teacher
 * who uploaded a 100-row CSV would then produce several hundred round trips on
 * every page load. Everything here loads once, keyed by id, joined in memory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyMembership } from '@/lib/services/groupMembership';
import { INVITE_COLUMNS } from './fulfil';
import { deriveInviteState, canResendAt, summarise, countJoined } from './counting';
import {
  LAUNCH_GOAL_TARGET,
  LAUNCH_WINDOW_DAYS,
  type ClassInviteRow,
  type InviteeView,
  type LaunchGoal,
} from './types';

const DAY_MS = 86_400_000;
const ENROLMENT_HOLDS_PLACE = new Set(['ACTIVE', 'GRACE', 'SECURED', 'COMPLETED']);
const ENROLMENT_AWAITING = new Set(['PENDING_PAYMENT']);

export type ActivationSnapshot = {
  goal: LaunchGoal;
  rows: InviteeView[];
  classes: Array<{ groupId: string; name: string; joined: number; invited: number }>;
  /**
   * True when this environment has not run migration 257 yet.
   *
   * Without it a missing table reads as an empty result, and the banner would
   * confidently tell a verified teacher they have 0 of 5 — indistinguishable
   * from the truth, on exactly the preview someone is most likely looking at.
   * The same reasoning as the SELECT_TIERS fallback in /api/tutor/demand.
   */
  unavailable: boolean;
};

/** PostgREST's answer when the relation simply is not there. */
function isSchemaMismatch(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    /does not exist|schema cache/i.test(error.message ?? '')
  );
}

type WindowFields = Omit<
  LaunchGoal,
  'invited' | 'needsAttention' | 'awaitingApproval' | 'awaitingParent'
>;

/**
 * The 14-day window, derived from the teacher's verification date.
 *
 * UTC throughout. America/Port_of_Spain is a display timezone in this codebase;
 * using it for the boundary would move every teacher's deadline by four hours
 * and make the count disagree with the admin cohort table.
 */
export function computeWindow(
  verifiedAt: string | null,
  metAt: string | null,
  joined: number
): WindowFields {
  const target = LAUNCH_GOAL_TARGET;

  if (!verifiedAt) {
    // Not verified yet, so no clock has started. The goal is still shown —
    // without a countdown — because the work is the same either way.
    return {
      target,
      joined,
      windowStartsAt: null,
      windowEndsAt: null,
      daysLeft: null,
      inWindow: false,
      activated: false,
      complete: joined >= target,
      metAt,
    };
  }

  const start = Date.parse(verifiedAt);
  const end = start + LAUNCH_WINDOW_DAYS * DAY_MS;
  const now = Date.now();
  const inWindow = now < end;

  return {
    target,
    joined,
    windowStartsAt: verifiedAt,
    windowEndsAt: new Date(end).toISOString(),
    daysLeft: inWindow ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null,
    inWindow,
    activated: true,
    complete: joined >= target,
    metAt,
  };
}

export async function buildActivationSnapshot(
  admin: SupabaseClient,
  tutorId: string,
  opts: { groupId?: string | null; limit?: number } = {}
): Promise<ActivationSnapshot> {
  const { data: profileData } = await admin
    .from('profiles')
    .select('tutor_verified_at, launch_goal_met_at')
    .eq('id', tutorId)
    .maybeSingle();
  const profile = profileData as {
    tutor_verified_at: string | null;
    launch_goal_met_at: string | null;
  } | null;

  let query = admin
    .from('class_invites')
    .select(INVITE_COLUMNS)
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.groupId) query = query.eq('group_id', opts.groupId);

  const { data: inviteData, error: inviteError } = await query;
  const invites = ((inviteData ?? []) as unknown as ClassInviteRow[]).filter(Boolean);

  const emptyGoal = (): LaunchGoal => ({
    ...computeWindow(profile?.tutor_verified_at ?? null, profile?.launch_goal_met_at ?? null, 0),
    invited: 0,
    needsAttention: 0,
    awaitingApproval: 0,
    awaitingParent: 0,
  });

  if (isSchemaMismatch(inviteError)) {
    return { goal: emptyGoal(), rows: [], classes: [], unavailable: true };
  }

  if (invites.length === 0) {
    return { goal: emptyGoal(), rows: [], classes: [], unavailable: false };
  }

  // ---- batch loads ---------------------------------------------------------

  const emails = Array.from(new Set(invites.map((i) => i.invitee_email.toLowerCase())));
  const claimantIds = Array.from(
    new Set(
      invites.flatMap((i) => [i.user_id, i.joined_student_id].filter(Boolean) as string[])
    )
  );

  const [byEmailRes, linksRes, groupRes] = await Promise.all([
    emails.length
      ? admin.from('profiles').select('id, email, full_name, display_name, role').in('email', emails)
      : Promise.resolve({ data: [] as unknown[] }),
    claimantIds.length
      ? admin.from('parent_child_links').select('parent_id, child_id').in('parent_id', claimantIds)
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('groups').select('id, name').eq('tutor_id', tutorId),
  ]);

  const profileByEmail = new Map<string, { id: string; name: string | null; role: string | null }>();
  for (const p of ((byEmailRes as { data: unknown[] }).data ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    display_name: string | null;
    role: string | null;
  }>) {
    if (p.email) {
      profileByEmail.set(p.email.toLowerCase(), {
        id: p.id,
        name: p.display_name || p.full_name || null,
        role: p.role,
      });
    }
  }

  const childrenByParent = new Map<string, string[]>();
  for (const l of ((linksRes as { data: unknown[] }).data ?? []) as Array<{
    parent_id: string;
    child_id: string;
  }>) {
    const list = childrenByParent.get(l.parent_id) ?? [];
    list.push(l.child_id);
    childrenByParent.set(l.parent_id, list);
  }

  const classNameById = new Map<string, string>();
  for (const g of ((groupRes as { data: unknown[] }).data ?? []) as Array<{
    id: string;
    name: string | null;
  }>) {
    classNameById.set(g.id, g.name ?? 'Untitled class');
  }
  const tutorGroupIds = Array.from(classNameById.keys());

  // Everyone who might hold the place an invitation is about: the invitee, an
  // account matching the address, and every child a parent invitee has a
  // consented link to.
  const candidateStudents = new Set<string>(claimantIds);
  for (const p of profileByEmail.values()) candidateStudents.add(p.id);
  for (const kids of childrenByParent.values()) for (const k of kids) candidateStudents.add(k);
  const studentIds = Array.from(candidateStudents);

  const canQuery = studentIds.length > 0 && tutorGroupIds.length > 0;
  const [membersRes, enrolmentsRes, requestsRes, namesRes] = await Promise.all([
    canQuery
      ? admin
          .from('group_members')
          .select('group_id, user_id, status')
          .in('user_id', studentIds)
          .in('group_id', tutorGroupIds)
      : Promise.resolve({ data: [] as unknown[] }),
    canQuery
      ? admin
          .from('group_enrollments')
          .select('group_id, student_id, status')
          .in('student_id', studentIds)
          .in('group_id', tutorGroupIds)
      : Promise.resolve({ data: [] as unknown[] }),
    canQuery
      ? admin
          .from('class_join_requests')
          .select('group_id, student_id, status')
          .in('student_id', studentIds)
          .in('group_id', tutorGroupIds)
      : Promise.resolve({ data: [] as unknown[] }),
    studentIds.length
      ? admin.from('profiles').select('id, full_name, display_name').in('id', studentIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nameById = new Map<string, string>();
  for (const p of ((namesRes as { data: unknown[] }).data ?? []) as Array<{
    id: string;
    full_name: string | null;
    display_name: string | null;
  }>) {
    nameById.set(p.id, p.display_name || p.full_name || 'Student');
  }

  const enrolledBy = new Map<string, Set<string>>();
  const awaitingBy = new Map<string, Set<string>>();
  const pendingParent = new Map<string, Set<string>>();
  const declinedParent = new Map<string, Set<string>>();

  const add = (map: Map<string, Set<string>>, student: string, group: string) => {
    const set = map.get(student) ?? new Set<string>();
    set.add(group);
    map.set(student, set);
  };

  for (const m of ((membersRes as { data: unknown[] }).data ?? []) as Array<{
    group_id: string;
    user_id: string;
    status: string;
  }>) {
    const state = classifyMembership(m.status);
    if (state === 'enrolled') add(enrolledBy, m.user_id, m.group_id);
    else if (state === 'pending') add(awaitingBy, m.user_id, m.group_id);
  }

  for (const e of ((enrolmentsRes as { data: unknown[] }).data ?? []) as Array<{
    group_id: string;
    student_id: string;
    status: string;
  }>) {
    const status = String(e.status ?? '').toUpperCase();
    if (ENROLMENT_HOLDS_PLACE.has(status)) add(enrolledBy, e.student_id, e.group_id);
    else if (ENROLMENT_AWAITING.has(status)) add(awaitingBy, e.student_id, e.group_id);
  }

  for (const r of ((requestsRes as { data: unknown[] }).data ?? []) as Array<{
    group_id: string;
    student_id: string;
    status: string;
  }>) {
    if (r.status === 'PENDING') add(pendingParent, r.student_id, r.group_id);
    else if (r.status === 'DECLINED') add(declinedParent, r.student_id, r.group_id);
  }

  const hits = (map: Map<string, Set<string>>, students: string[], group: string | null): boolean =>
    students.some((s) => {
      const set = map.get(s);
      if (!set) return false;
      // A group-less invitation is satisfied by any class of this teacher's,
      // which is what makes "invite before you have built the class" work.
      return group ? set.has(group) : set.size > 0;
    });

  // ---- per row -------------------------------------------------------------

  const now = Date.now();
  const rows: InviteeView[] = invites.map((invite) => {
    const matched = profileByEmail.get(invite.invitee_email.toLowerCase()) ?? null;
    const accountId = invite.user_id ?? matched?.id ?? null;
    const kids = accountId ? childrenByParent.get(accountId) ?? [] : [];

    const subjects = [
      invite.joined_student_id,
      invite.user_id,
      matched?.id ?? null,
      ...kids,
    ].filter(Boolean) as string[];

    const { state, attentionReason, counts } = deriveInviteState({
      invite,
      hasAccount: Boolean(accountId),
      parentHasChild: kids.length > 0,
      membership: {
        enrolled: hits(enrolledBy, subjects, invite.group_id),
        awaitingTutor: hits(awaitingBy, subjects, invite.group_id),
      },
      parentApprovalPending: hits(pendingParent, subjects, invite.group_id),
      parentDeclined: hits(declinedParent, subjects, invite.group_id),
      now,
    });

    return {
      id: invite.id,
      email: invite.invitee_email,
      name: invite.invitee_name ?? matched?.name ?? null,
      kind: invite.invitee_kind,
      state,
      attentionReason,
      counts,
      groupId: invite.group_id,
      className: invite.group_id ? classNameById.get(invite.group_id) ?? null : null,
      source: invite.source,
      invitedAt: invite.created_at,
      lastSentAt: invite.last_sent_at,
      sendCount: invite.send_count,
      canResendAt: canResendAt(invite, now),
      joinedStudentName: invite.joined_student_id
        ? nameById.get(invite.joined_student_id) ?? null
        : null,
      joinedStudentId: invite.joined_student_id,
    };
  });

  const totals = summarise(rows);
  const joined = countJoined(rows);

  const perClass = new Map<string, { joined: number; invited: number }>();
  for (const row of rows) {
    if (!row.groupId) continue;
    const bucket = perClass.get(row.groupId) ?? { joined: 0, invited: 0 };
    if (row.state === 'joined') bucket.joined += 1;
    else bucket.invited += 1;
    perClass.set(row.groupId, bucket);
  }

  return {
    goal: {
      ...computeWindow(
        profile?.tutor_verified_at ?? null,
        profile?.launch_goal_met_at ?? null,
        joined
      ),
      invited: totals.invited,
      needsAttention: totals.needsAttention,
      awaitingApproval: totals.awaitingApproval,
      awaitingParent: totals.awaitingParent,
    },
    rows,
    classes: Array.from(perClass.entries()).map(([groupId, v]) => ({
      groupId,
      name: classNameById.get(groupId) ?? 'Untitled class',
      joined: v.joined,
      invited: v.invited,
    })),
    unavailable: false,
  };
}
