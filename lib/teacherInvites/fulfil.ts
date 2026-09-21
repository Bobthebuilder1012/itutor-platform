// The one place an invitation becomes a credit.
//
// "Sending an invitation is not success. A joined/activated student is
// success." Everything else in this feature records intent; this file is where
// intent becomes the number the business is measured on, so it is deliberately
// the only writer of status='joined'.
//
// IDEMPOTENT BY CONSTRUCTION. The update is guarded `.neq('status','joined')`,
// so a replayed cron sweep, a duplicate webhook and a double-click all write
// nothing the second time — and because the event is emitted only when that
// update returned a row, they emit nothing either. There is no dedupe index on
// product_events on this branch, and this is why one is not needed here.
//
// CALLED FROM EVERY WRITER, AND FROM A NET. Inline calls give the teacher an
// immediate number; the reconciler cron catches the writer nobody remembered to
// hook up, including the ones added after this was written.

import type { SupabaseClient } from '@supabase/supabase-js';
import { trackForUser } from '@/lib/analytics/track';
import { PRODUCT_EVENTS, type JoinRoute } from '@/lib/analytics/events';
import { LAUNCH_GOAL_TARGET } from './types';
import type { ClassInviteRow } from './types';
import { readMembership, parentsOf } from './counting';

const INVITE_COLUMNS =
  'id, tutor_id, group_id, invitee_email, invitee_name, invitee_kind, token, user_id, ' +
  'claimed_at, role, joined_student_id, status, delivery_state, delivery_error, ' +
  'provider_message_id, last_sent_at, send_count, source, batch_id, expires_at, ' +
  'created_at, updated_at, accepted_at, joined_at, revoked_at';

export type FulfilResult =
  | { fulfilled: true; inviteId: string; tutorId: string }
  | { fulfilled: false; reason: 'no_open_invite' | 'not_enrolled' | 'already_joined' | 'error' };

/**
 * Find the open invitation that this student joining should close.
 *
 * Three ways an invitation can belong to a student, in priority order:
 *
 *   1. They claimed it themselves.
 *   2. A PARENT claimed it and this student is that parent's child. This clause
 *      is the entire parent-attribution mechanism. It reads parent_child_links,
 *      whose only writer is the existing consent flow, so a teacher cannot
 *      manufacture a link and award themselves a student.
 *   3. The address matches. Covers someone who was invited, ignored the email
 *      and signed up directly later — the teacher still caused it.
 *
 * FIRST TEACHER WINS. Ordered by created_at ascending so that when two teachers
 * invited the same person, the credit goes to whoever asked first, mirroring the
 * first-touch rule the attribution cookie already uses.
 */
async function findOpenInvite(
  admin: SupabaseClient,
  params: { studentId: string; studentEmail: string | null; groupId: string | null }
): Promise<ClassInviteRow | null> {
  const parents = await parentsOf(admin, params.studentId);
  const claimants = [params.studentId, ...parents];

  // PostgREST cannot express "user_id in (...) OR lower(email) = ..." in one
  // filter chain without or() string building, and an email address interpolated
  // into an or() filter is an injection surface. Two queries, merged in TS.
  const byClaimant = admin
    .from('teacher_invites')
    .select(INVITE_COLUMNS)
    .in('user_id', claimants)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: true });

  const byEmail = params.studentEmail
    ? admin
        .from('teacher_invites')
        .select(INVITE_COLUMNS)
        .eq('invitee_email', params.studentEmail.trim().toLowerCase())
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: true })
    : null;

  const [claimantRes, emailRes] = await Promise.all([
    byClaimant,
    byEmail ?? Promise.resolve({ data: [] as unknown[] }),
  ]);

  const rows = [
    ...(((claimantRes as { data: unknown[] }).data ?? []) as ClassInviteRow[]),
    ...(((emailRes as { data: unknown[] }).data ?? []) as ClassInviteRow[]),
  ];
  if (rows.length === 0) return null;

  // De-duplicate (the two queries overlap) and keep the earliest.
  const byId = new Map<string, ClassInviteRow>();
  for (const row of rows) byId.set(row.id, row);

  const candidates = Array.from(byId.values())
    .filter((row) => {
      // A class-scoped invitation only closes for its own class. A group-less
      // one closes for any class of that teacher's, which is what makes
      // "invite before you have a class" work.
      if (!row.group_id) return true;
      return params.groupId ? row.group_id === params.groupId : false;
    })
    // A teacher cannot be credited with their own account joining.
    .filter((row) => row.tutor_id !== params.studentId)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  return candidates[0] ?? null;
}

/**
 * Close the invitation this student's enrolment satisfies.
 *
 * Safe to call from anywhere that might have just created a membership, whether
 * or not an invitation exists. Never throws: a failure here costs a credit, not
 * a student's place in a class.
 */
export async function fulfilClassInvite(
  admin: SupabaseClient,
  params: { studentId: string; groupId: string | null; via?: JoinRoute }
): Promise<FulfilResult> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', params.studentId)
      .maybeSingle();
    const studentEmail = (profile as { email: string | null } | null)?.email ?? null;

    const invite = await findOpenInvite(admin, {
      studentId: params.studentId,
      studentEmail,
      groupId: params.groupId,
    });
    if (!invite) return { fulfilled: false, reason: 'no_open_invite' };

    // THE GATE. An invitation closes only when the student actually holds a
    // place — not when they registered, not when they asked, and not while the
    // teacher's own approval queue still has them. See counting.ts for why the
    // intermediate states deliberately do not count.
    const membership = await readMembership(admin, {
      studentId: params.studentId,
      groupId: invite.group_id ?? params.groupId,
      tutorId: invite.tutor_id,
    });
    if (!membership.enrolled) return { fulfilled: false, reason: 'not_enrolled' };

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from('teacher_invites')
      .update({
        status: 'joined',
        joined_student_id: params.studentId,
        joined_at: now,
        // A group-less invitation learns which class it produced.
        group_id: invite.group_id ?? params.groupId,
      })
      .eq('id', invite.id)
      .neq('status', 'joined')
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[classInvites] fulfil failed:', error.message);
      return { fulfilled: false, reason: 'error' };
    }
    // Someone else closed it between the read and the write. Not an error, and
    // emitting here would double-count.
    if (!updated) return { fulfilled: false, reason: 'already_joined' };

    const sentAt = Date.parse(invite.last_sent_at ?? invite.created_at);
    const daysSinceSent = Number.isFinite(sentAt)
      ? Math.max(0, Math.round((Date.now() - sentAt) / 86_400_000))
      : 0;

    await trackForUser(
      PRODUCT_EVENTS.TEACHER_INVITE_JOINED,
      {
        invite_id: invite.id,
        tutor_id: invite.tutor_id,
        group_id: invite.group_id ?? params.groupId,
        student_id: params.studentId,
        via: params.via ?? (invite.role === 'parent' ? 'parent' : 'student'),
        days_since_sent: daysSinceSent,
      },
      invite.tutor_id
    );

    await markGoalIfMet(admin, invite.tutor_id);

    return { fulfilled: true, inviteId: invite.id, tutorId: invite.tutor_id };
  } catch (err) {
    console.error('[classInvites] fulfil threw:', err);
    return { fulfilled: false, reason: 'error' };
  }
}

/**
 * Stamp profiles.launch_goal_met_at the first time a teacher reaches the target.
 *
 * Write-once, guarded on null, so the moment recorded is the moment it actually
 * happened rather than the last time anyone recounted. The column is a cache —
 * the migration carries the query that rebuilds it — so being wrong here is
 * recoverable, but being wrong in a way that fires a congratulation email twice
 * is not.
 */
async function markGoalIfMet(admin: SupabaseClient, tutorId: string): Promise<void> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('launch_goal_met_at, tutor_verified_at')
      .eq('id', tutorId)
      .maybeSingle();
    const row = profile as { launch_goal_met_at: string | null; tutor_verified_at: string | null } | null;
    if (!row || row.launch_goal_met_at) return;

    const { data } = await admin
      .from('teacher_invites')
      .select('joined_student_id')
      .eq('tutor_id', tutorId)
      .eq('status', 'joined')
      .not('joined_student_id', 'is', null);

    const students = new Set(
      ((data ?? []) as Array<{ joined_student_id: string }>).map((r) => r.joined_student_id)
    );
    if (students.size < LAUNCH_GOAL_TARGET) return;

    const metAt = new Date().toISOString();
    const { data: stamped } = await admin
      .from('profiles')
      .update({ launch_goal_met_at: metAt })
      .eq('id', tutorId)
      .is('launch_goal_met_at', null)
      .select('id')
      .maybeSingle();

    // Only the write that actually won emits, so two concurrent fulfilments
    // cannot both announce the goal.
    if (!stamped) return;

    const verifiedAt = row.tutor_verified_at ? Date.parse(row.tutor_verified_at) : NaN;
    const daysToGoal = Number.isFinite(verifiedAt)
      ? Math.max(0, Math.round((Date.now() - verifiedAt) / 86_400_000))
      : 0;

    await trackForUser(
      PRODUCT_EVENTS.LAUNCH_GOAL_MET,
      { joined: students.size, days_to_goal: daysToGoal },
      tutorId
    );
  } catch (err) {
    console.error('[classInvites] goal stamp threw:', err);
  }
}

export { INVITE_COLUMNS };
