/**
 * Sending an invitation, and recording honestly whether it left.
 *
 * Structured like lib/services/parentInvite.ts: email plus an in-app
 * notification when the address already belongs to an account, so the flow
 * still works for someone who never reads email.
 *
 * ONE DELIBERATE DEPARTURE FROM EVERY OTHER CALLER OF sendEmail. Almost every
 * send in this codebase ends in `.catch(() => {})`, which is right when the
 * email is a courtesy. Here the email IS the product: an invitation that did
 * not leave is not an invitation, and a teacher staring at "Invitation sent"
 * for mail that never went is the single most damaging thing this dashboard
 * could do. So the return value is inspected and written to the row.
 *
 * sendEmail reports success in two cases where nothing was sent — no
 * RESEND_API_KEY ('disabled') and an address outside EMAIL_ALLOWLIST
 * ('suppressed'). Both are recorded as 'suppressed', not 'sent'. Without that,
 * staging shows a perfect green dashboard for zero delivered mail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/emailService';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';
import { classInviteEmail } from '@/lib/services/classInviteEmail';
import { nextSessionLabel } from '@/lib/server/classJoinRequests';
import { inviteUrl } from '@/lib/classInvites/links';
import type { ClassInviteRow, DeliveryState } from '@/lib/classInvites/types';

export type DeliveryOutcome = {
  state: DeliveryState;
  error: string | null;
  messageId: string | null;
};

/**
 * Send (or re-send) one invitation and record what happened.
 *
 * Always updates the row, including on failure — the delivery columns are the
 * only evidence the dashboard has, so a silent failure here becomes an
 * invitation that looks fine forever.
 */
export async function deliverClassInvite(
  admin: SupabaseClient,
  invite: ClassInviteRow,
  opts: { tutorName: string; className: string | null; note?: string | null }
): Promise<DeliveryOutcome> {
  const scheduleLabel = invite.group_id
    ? await nextSessionLabel(admin, invite.group_id).catch(() => null)
    : null;

  const email = classInviteEmail({
    tutorName: opts.tutorName,
    className: opts.className,
    inviteeName: invite.invitee_name,
    inviteeKind: invite.invitee_kind,
    acceptUrl: inviteUrl(invite.token),
    scheduleLabel,
    note: opts.note ?? null,
  });

  const result = await sendEmail({
    to: invite.invitee_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  let outcome: DeliveryOutcome;
  if (!result.success) {
    outcome = { state: 'send_failed', error: result.error ?? 'Send failed', messageId: null };
  } else if (result.messageId === 'disabled' || result.messageId === 'suppressed') {
    outcome = {
      state: 'suppressed',
      error:
        result.messageId === 'disabled'
          ? 'Email is not configured in this environment'
          : 'Address is outside EMAIL_ALLOWLIST',
      messageId: null,
    };
  } else {
    outcome = { state: 'sent', error: null, messageId: result.messageId ?? null };
  }

  const now = new Date().toISOString();
  await admin
    .from('class_invites')
    .update({
      delivery_state: outcome.state,
      delivery_error: outcome.error,
      // Stored at send time because a bounce webhook cannot correlate to an
      // invitation through an id that was never kept, and it cannot be
      // backfilled afterwards.
      provider_message_id: outcome.messageId,
      last_sent_at: now,
      send_count: (invite.send_count ?? 0) + 1,
      // A send that failed is not "pending a reply" — nothing is pending.
      ...(outcome.state === 'send_failed' ? { status: 'failed' as const } : {}),
    })
    .eq('id', invite.id);

  // An in-app notice as well, when the address already has an account. This is
  // what makes the flow survive an email that is never opened.
  try {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('email', invite.invitee_email)
      .maybeSingle();
    const existing = data as { id: string } | null;
    if (existing && existing.id !== invite.tutor_id) {
      const klass = opts.className ?? 'a class';
      await notifyInApp(admin, {
        userId: existing.id,
        // An existing type. 245's header records what an unlisted one does:
        // it throws on insert, and it silently killed join-request notices
        // once already.
        type: 'class_invite',
        title: `${opts.tutorName} invited you to ${klass}`,
        message: `${opts.tutorName} has invited you to join "${klass}" on iTutor.`,
        link: invite.group_id ? `/student/explore/${invite.group_id}` : '/student/explore',
        metadata: { inviteId: invite.id, groupId: invite.group_id },
      });
    }
  } catch (e) {
    console.error('[classInvite] in-app notice failed:', e);
  }

  return outcome;
}
