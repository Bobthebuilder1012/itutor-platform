// Adopting an invitation onto the account that accepted it.
//
// The row is written before the account exists, so it is keyed on a random
// token held in a first-party cookie, with a nullable user_id. At the first
// authenticated load the row is adopted onto the account. Class Match and the
// Finder solve the same problem the same way.
//
// WRITTEN SELF-CONTAINED, ON PURPOSE. lib/matching/claim.ts is the shared
// implementation of this algorithm, and it is not on this branch. Copying it
// would have imported a footgun it documents at length: its `unclaimPrior` step
// nulls user_id on every OTHER row the account holds, which is correct only for
// tables with UNIQUE(user_id). class_invites is deliberately many-rows-per
// person — two teachers may invite the same student, and one teacher may invite
// them to two classes — so that step would silently destroy a rival teacher's
// attribution with no error anywhere. There is no collision to resolve here, so
// the step simply does not exist. If lib/matching/claim.ts later merges into
// this branch and someone reaches for it, it must be called with
// `unclaimPrior: false`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { fulfilClassInvite, INVITE_COLUMNS } from './fulfil';
import { isTokenShaped } from './token';
import type { ClassInviteRow } from './types';

export type ClaimResult =
  | { claimed: true; invite: ClassInviteRow }
  | { claimed: false; reason: 'bad_token' | 'not_found' | 'expired' | 'self' | 'error' };

/**
 * Adopt an invitation token onto a user.
 *
 * Never throws. Every failure path returns a reason and leaves the row alone —
 * a failed adoption costs attribution, never a registration.
 */
export async function claimClassInvite(
  admin: SupabaseClient,
  params: { token: string; userId: string }
): Promise<ClaimResult> {
  try {
    if (!isTokenShaped(params.token) || !params.userId) {
      return { claimed: false, reason: 'bad_token' };
    }

    const { data, error } = await admin
      .from('class_invites')
      .select(INVITE_COLUMNS)
      .eq('token', params.token)
      .maybeSingle();

    if (error) {
      console.warn('[classInvites] claim read failed:', error.message);
      return { claimed: false, reason: 'error' };
    }
    const invite = (data as ClassInviteRow | null) ?? null;
    if (!invite) return { claimed: false, reason: 'not_found' };

    // A teacher following their own link is not a student they brought. The
    // table's CHECK refuses the write anyway; catching it here keeps the error
    // out of the logs on what is an ordinary thing to do while testing.
    if (invite.tutor_id === params.userId) return { claimed: false, reason: 'self' };

    // Idempotent fast path. Keep the original claimed_at rather than bumping it
    // on every authenticated page load.
    if (invite.user_id === params.userId && invite.claimed_at) {
      await fulfilClassInvite(admin, {
        studentId: params.userId,
        groupId: invite.group_id,
        via: invite.role === 'parent' ? 'parent' : 'student',
      });
      return { claimed: true, invite };
    }

    if (invite.status === 'revoked') return { claimed: false, reason: 'not_found' };

    if (Date.parse(invite.expires_at) < Date.now()) {
      // Lazy expiry, the same way the parent invite reader does it: the row is
      // corrected by the first person to look at it rather than by a sweep.
      await admin
        .from('class_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id)
        .eq('status', 'pending');
      return { claimed: false, reason: 'expired' };
    }

    // Reconcile what the teacher guessed against what the account actually is.
    // The account always wins: a teacher who typed a parent's address into the
    // student field has not changed who that person is.
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', params.userId)
      .maybeSingle();
    const actualRole = (profile as { role: string | null } | null)?.role ?? null;
    const reconciledKind =
      actualRole === 'parent' ? 'parent' : actualRole === 'student' ? 'student' : invite.invitee_kind;

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from('class_invites')
      .update({
        user_id: params.userId,
        claimed_at: invite.claimed_at ?? now,
        accepted_at: invite.accepted_at ?? now,
        invitee_kind: reconciledKind,
        // Only 'pending' advances. A row already further along the funnel is
        // not dragged backwards by a late click on an old email.
        ...(invite.status === 'pending' ? { status: 'accepted' as const } : {}),
      })
      .eq('id', invite.id)
      .select(INVITE_COLUMNS)
      .maybeSingle();

    if (updateError || !updated) {
      console.warn('[classInvites] claim update failed:', updateError?.message ?? 'no row');
      return { claimed: false, reason: 'error' };
    }

    const claimedRow = updated as unknown as ClassInviteRow;

    // Attribute the signup to the teacher, but never over an existing value:
    // someone who arrived through a campaign and later accepted an invitation
    // was still brought here by the campaign.
    await admin
      .from('profiles')
      .update({ signup_ref: `teacher:${claimedRow.tutor_id}` })
      .eq('id', params.userId)
      .is('signup_ref', null);

    await track(
      PRODUCT_EVENTS.TEACHER_INVITE_ACCEPTED,
      {
        invite_id: claimedRow.id,
        tutor_id: claimedRow.tutor_id,
        role: actualRole ?? claimedRow.role,
      },
      { userId: params.userId }
    );

    // Someone who clicked, signed up and joined in one sitting should be
    // counted now rather than waiting for the reconciler.
    await fulfilClassInvite(admin, {
      studentId: params.userId,
      groupId: claimedRow.group_id,
      via: claimedRow.role === 'parent' ? 'parent' : 'student',
    });

    return { claimed: true, invite: claimedRow };
  } catch (err) {
    console.warn('[classInvites] claim threw:', err);
    return { claimed: false, reason: 'error' };
  }
}

/**
 * Record that someone arrived through a shared class link.
 *
 * A link is not an addressed invitation — nobody was mailed, so there is no row
 * until a real person signs up through it. At that moment the address is known
 * and a row can be written honestly. This is what lets "Copy class link" move
 * the teacher's number: without it the button would be decorative, and a
 * WhatsApp group is realistically where most of these students come from.
 *
 * Deliberately not created as 'pending': nothing is awaiting a reply.
 */
export async function recordLinkArrival(
  admin: SupabaseClient,
  params: { groupId: string; tutorId: string; userId: string }
): Promise<{ recorded: boolean }> {
  try {
    if (params.tutorId === params.userId) return { recorded: false };

    const { data: profile } = await admin
      .from('profiles')
      .select('email, full_name, display_name, role')
      .eq('id', params.userId)
      .maybeSingle();
    const p = profile as {
      email: string | null;
      full_name: string | null;
      display_name: string | null;
      role: string | null;
    } | null;
    if (!p?.email) return { recorded: false };

    const email = p.email.trim().toLowerCase();

    // There is no unique index on (tutor_id, invitee_email): 257 leaves
    // duplicates to be REPORTED as an AttentionReason rather than refused, so
    // an unconditional insert here would show the same person twice on the
    // dashboard. Check first — if this teacher already has an open invitation
    // to this address, THAT invitation is the record, and this arrival closes
    // it through the normal path.
    const { data: open } = await admin
      .from('class_invites')
      .select('id')
      .eq('tutor_id', params.tutorId)
      .eq('invitee_email', email)
      .in('status', ['pending', 'accepted'])
      .limit(1)
      .maybeSingle();

    if (open) {
      await fulfilClassInvite(admin, {
        studentId: params.userId,
        groupId: params.groupId,
        via: 'link',
      });
      return { recorded: false };
    }

    const role = p.role === 'parent' ? 'parent' : 'student';
    const { data, error } = await admin
      .from('class_invites')
      .insert({
        tutor_id: params.tutorId,
        group_id: params.groupId,
        invitee_email: email,
        invitee_name: p.display_name || p.full_name || null,
        invitee_kind: role,
        role,
        // The link token is the class's, not this row's, so this row gets its
        // own — the column is unique and nothing will ever resolve by it.
        token: `link:${params.groupId}:${params.userId}`.slice(0, 120),
        user_id: params.userId,
        claimed_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        status: 'accepted',
        // Nothing was mailed, so 'queued' would be a lie that later reads as a
        // stuck send. The link WAS the delivery.
        delivery_state: 'sent',
        source: 'link',
      })
      .select('id')
      .maybeSingle();

    // A race with a concurrent signup through the same link, or the unique
    // token colliding. The arrival is not lost either way: the reconciler cron
    // sweeps accepted rows and closes whatever exists.
    if (error) return { recorded: false };

    await fulfilClassInvite(admin, {
      studentId: params.userId,
      groupId: params.groupId,
      via: 'link',
    });

    return { recorded: Boolean(data) };
  } catch (err) {
    console.warn('[classInvites] link arrival threw:', err);
    return { recorded: false };
  }
}

/** Convenience for callers that have no client to hand. */
export function serviceClient(): SupabaseClient {
  return getServiceClient();
}
