// =====================================================
// CLASS INVITES — minting, resolving, redeeming
// =====================================================
// The one place that knows the rules of a class invitation. Everything about
// membership is delegated to lib/server/classJoinRequests, so an invited
// student and a student who walked in off the marketplace produce exactly the
// same roster row, the same gates and the same tutor notice.
//
// Migration 257 holds the shape. The links are multi-use: a link pasted into a
// group chat must work for everyone who taps it, so the invite is the link and
// each acceptance is its own redemption row.

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  performGroupJoin,
  resolveClassJoinGate,
  createClassJoinRequest,
} from '@/lib/server/classJoinRequests';
import { hasAnyPrice } from '@/lib/payments/groupPricing';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';

/** Where a class invite link lives. Shares outlive the tab they came from. */
const PUBLIC_BASE = 'https://myitutor.com';

export function classInviteUrl(token: string): string {
  return `${PUBLIC_BASE}/i/${token}`;
}

/** Same generator as app/api/parent/invite-child/route.ts. Stored raw, like 194. */
function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Guards the shape before a token reaches a query, so a truncated or
 * hand-typed link fails cheaply. The unique index is what actually resolves it.
 */
export function isTokenShaped(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export type InviteRow = {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_email: string | null;
  source: string | null;
  token: string;
  max_redemptions: number | null;
  expires_at: string;
  revoked_at: string | null;
};

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/**
 * The caller may invite to this class if they run it or are in it. Anyone else
 * asking is told the class does not exist rather than that they lack
 * permission — the same non-disclosure 194's read route uses.
 */
export async function canInviteToClass(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data: group } = await admin
    .from('groups')
    .select('id, tutor_id, archived_at')
    .eq('id', groupId)
    .maybeSingle();

  const g = group as { id: string; tutor_id: string; archived_at: string | null } | null;
  if (!g || g.archived_at) return false;
  if (g.tutor_id === userId) return true;

  const { data: member } = await admin
    .from('group_members')
    .select('status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  const status = (member as { status: string } | null)?.status ?? null;
  return status === 'approved' || status === 'active';
}

/**
 * The share link for this person and this class, minted once and reused.
 *
 * Reopening the share sheet must not mint a row every time, so a live link is
 * returned as-is; the partial unique index in 257 enforces the same thing at
 * the database level if two tabs race.
 */
export async function mintShareInvite(
  admin: SupabaseClient,
  params: { groupId: string; inviterId: string; source?: string | null },
): Promise<InviteRow | null> {
  const readLive = async () => {
    const { data } = await admin
      .from('class_invites')
      .select('*')
      .eq('group_id', params.groupId)
      .eq('inviter_id', params.inviterId)
      .is('invitee_email', null)
      .is('revoked_at', null)
      .maybeSingle();
    return (data as InviteRow | null) ?? null;
  };

  const live = await readLive();
  if (live && new Date(live.expires_at).getTime() > Date.now()) return live;

  // Expired: push it out rather than leave a dead link in circulation. The
  // token is unchanged, exactly as the parent invite resend does, so a link
  // already sent to somebody keeps working.
  if (live) {
    const { data: renewed } = await admin
      .from('class_invites')
      .update({ expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() })
      .eq('id', live.id)
      .select('*')
      .single();
    return (renewed as InviteRow | null) ?? live;
  }

  const { data: inserted, error } = await admin
    .from('class_invites')
    .insert({
      group_id: params.groupId,
      inviter_id: params.inviterId,
      source: params.source ?? null,
      token: mintToken(),
    })
    .select('*')
    .single();

  // Lost the race against another tab: read the winner rather than fail.
  if (error) return await readLive();

  return inserted as InviteRow;
}

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

export type ResolvedInvite = {
  token: string;
  status: 'ok' | 'expired' | 'revoked' | 'full';
  groupId: string;
  className: string;
  subject: string | null;
  level: string | null;
  coverImage: string | null;
  priced: boolean;
  inviterName: string;
  inviterAvatar: string | null;
  tutorName: string;
};

/**
 * What the invitation page shows. Returns null for anything the visitor should
 * not be able to tell apart: an unknown token, a token for a private or
 * archived class, a garbage string. 194's read route sets the precedent — a
 * valid-but-not-yours token must be indistinguishable from nonsense, or the
 * endpoint becomes an oracle.
 */
export async function resolveInvite(
  admin: SupabaseClient,
  token: string,
): Promise<ResolvedInvite | null> {
  if (!isTokenShaped(token)) return null;

  const { data } = await admin
    .from('class_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  const invite = data as InviteRow | null;
  if (!invite) return null;

  const { data: groupRow } = await admin
    .from('groups')
    .select('*')
    .eq('id', invite.group_id)
    .maybeSingle();

  const group = groupRow as Record<string, any> | null;
  if (!group || group.archived_at) return null;

  // A private class is not advertised, even to someone holding a real token.
  if (String(group.visibility ?? 'public').toLowerCase() !== 'public') return null;

  const [inviter, tutor] = await Promise.all([
    admin.from('profiles').select('full_name, display_name, avatar_url')
      .eq('id', invite.inviter_id).maybeSingle(),
    admin.from('profiles').select('full_name, display_name')
      .eq('id', group.tutor_id).maybeSingle(),
  ]);

  const inv = inviter.data as {
    full_name: string | null; display_name: string | null; avatar_url: string | null;
  } | null;
  const tut = tutor.data as { full_name: string | null; display_name: string | null } | null;

  let status: ResolvedInvite['status'] = 'ok';
  if (invite.revoked_at) status = 'revoked';
  else if (new Date(invite.expires_at).getTime() < Date.now()) status = 'expired';
  else if (invite.max_redemptions != null) {
    const { count } = await admin
      .from('class_invite_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('invite_id', invite.id);
    if ((count ?? 0) >= invite.max_redemptions) status = 'full';
  }

  return {
    token: invite.token,
    status,
    groupId: invite.group_id,
    className: group.name ?? 'a class',
    subject: group.subject ?? null,
    level: group.form_level ?? group.level ?? null,
    coverImage: group.cover_image ?? group.header_image ?? null,
    priced: hasAnyPrice(group as any),
    inviterName: inv?.display_name || inv?.full_name || 'Someone',
    inviterAvatar: inv?.avatar_url ?? null,
    tutorName: tut?.display_name || tut?.full_name || 'their tutor',
  };
}

// ---------------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------------

export type RedeemOutcome =
  | { ok: true; outcome: 'joined' | 'requested' | 'pending_payment'; groupId: string; landing: string }
  | { ok: false; reason: string };

/**
 * Accept an invitation.
 *
 * A PRICED CLASS IS NEVER JOINED HERE. performGroupJoin writes a roster row and
 * takes no money, so redeeming an invite into a paid class would hand out a
 * seat for nothing — the same invariant approveClassJoinRequest states for
 * parent approvals. The invited student is sent to the class page to pay, and
 * the redemption stays 'pending_payment' until the seat is really theirs.
 */
export async function redeemInvite(
  admin: SupabaseClient,
  params: { token: string; studentId: string; source?: string | null },
): Promise<RedeemOutcome> {
  if (!isTokenShaped(params.token)) return { ok: false, reason: 'invalid' };

  const { data } = await admin
    .from('class_invites')
    .select('*')
    .eq('token', params.token)
    .maybeSingle();

  const invite = data as InviteRow | null;
  if (!invite) return { ok: false, reason: 'invalid' };
  if (invite.revoked_at) return { ok: false, reason: 'revoked' };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (invite.inviter_id === params.studentId) return { ok: false, reason: 'own_invite' };

  const { data: groupRow } = await admin
    .from('groups')
    .select('*')
    .eq('id', invite.group_id)
    .maybeSingle();
  const group = groupRow as Record<string, any> | null;
  if (!group || group.archived_at) return { ok: false, reason: 'class_unavailable' };

  // Seat cap for a named invite. Checked before any membership write, and
  // skipped for someone who has already redeemed this link.
  if (invite.max_redemptions != null) {
    const { data: mine } = await admin
      .from('class_invite_redemptions')
      .select('id')
      .eq('invite_id', invite.id)
      .eq('student_id', params.studentId)
      .maybeSingle();
    if (!mine) {
      const { count } = await admin
        .from('class_invite_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('invite_id', invite.id);
      if ((count ?? 0) >= invite.max_redemptions) return { ok: false, reason: 'full' };
    }
  }

  const record = async (status: 'joined' | 'requested' | 'pending_payment') => {
    await admin
      .from('class_invite_redemptions')
      .upsert(
        {
          invite_id: invite.id,
          student_id: params.studentId,
          status,
          source: params.source ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'invite_id,student_id' },
      );
  };

  // 1. Priced class — no seat, no roster row. Pay first.
  if (hasAnyPrice(group as any)) {
    await record('pending_payment');
    return {
      ok: true,
      outcome: 'pending_payment',
      groupId: invite.group_id,
      landing: `/student/explore/${invite.group_id}?invite=${encodeURIComponent(invite.token)}`,
    };
  }

  // 2. The parent's gate runs before the tutor's. An invited child whose parent
  //    must approve gets a request, not a place.
  const gate = await resolveClassJoinGate(admin, params.studentId);
  if (gate.needsParentApproval) {
    const created = await createClassJoinRequest(admin, {
      groupId: invite.group_id,
      studentId: params.studentId,
      parentId: gate.parentId,
    });
    if (!created.ok) return { ok: false, reason: created.reason };
    await record('requested');
    return {
      ok: true,
      outcome: 'requested',
      groupId: invite.group_id,
      landing: `/student/explore/${invite.group_id}`,
    };
  }

  // 3. Free class — the ordinary join, tutor gate and tutor notice included.
  const joined = await performGroupJoin(admin, {
    groupId: invite.group_id,
    studentId: params.studentId,
  });
  if (!joined.ok) return { ok: false, reason: joined.reason };

  await record(joined.status === 'pending' ? 'requested' : 'joined');

  // Tell the inviter their invitation worked. Never let this undo the join.
  try {
    const { data: student } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', params.studentId)
      .maybeSingle();
    const s = student as { full_name: string | null; display_name: string | null } | null;
    const who = s?.display_name || s?.full_name || 'Someone';
    await notifyInApp(admin, {
      userId: invite.inviter_id,
      type: 'class_invite_accepted',
      title: `${who} accepted your invitation`,
      message: `${who} joined "${group.name ?? 'your class'}" from your invite link.`,
      link: `/student/explore/${invite.group_id}`,
      metadata: { groupId: invite.group_id, studentId: params.studentId },
    });
  } catch (e) {
    console.error('[classInvites] inviter notification failed:', e);
  }

  return {
    ok: true,
    outcome: joined.status === 'pending' ? 'requested' : 'joined',
    groupId: invite.group_id,
    landing: joined.status === 'pending'
      ? `/student/explore/${invite.group_id}`
      : `/student/classes/${invite.group_id}`,
  };
}

/**
 * Close the loop on a priced invite once the seat exists. Cheap to call, and
 * safe to call repeatedly — the same self-settling idea as settleIfEnrolled.
 */
export async function settleInviteIfEnrolled(
  admin: SupabaseClient,
  params: { token: string; studentId: string },
): Promise<void> {
  if (!isTokenShaped(params.token)) return;

  const { data } = await admin
    .from('class_invites')
    .select('id, group_id')
    .eq('token', params.token)
    .maybeSingle();
  const invite = data as { id: string; group_id: string } | null;
  if (!invite) return;

  const { data: member } = await admin
    .from('group_members')
    .select('status')
    .eq('group_id', invite.group_id)
    .eq('user_id', params.studentId)
    .maybeSingle();

  const status = (member as { status: string } | null)?.status ?? null;
  if (status !== 'approved' && status !== 'active') return;

  await admin
    .from('class_invite_redemptions')
    .update({ status: 'joined', updated_at: new Date().toISOString() })
    .eq('invite_id', invite.id)
    .eq('student_id', params.studentId)
    .eq('status', 'pending_payment');
}
