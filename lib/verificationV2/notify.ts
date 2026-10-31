// In-app notices to a teacher when their verification status changes. In-app only:
// this file sends no email and no push of its own (an insert into notifications does
// reach the existing push fan-out trigger, exactly like every other notification).
//
//   in_review                  submitted for review
//   verified                   approved                        (type VERIFICATION_APPROVED)
//   rejected     + reason      not approved                    (type VERIFICATION_REJECTED)
//   more_info    + reason      sent back to the teacher        (type VERIFICATION_MORE_INFO)
//   revoked      + reason      verification taken away         (type VERIFICATION_REVOKED)
//   reverification_required    asked to verify again
//   identity_failed + attempts left   the ID check did not pass
//
// ONE notice per change, three layers deep:
//   1. Callers notify only after the status function reported the change (the
//      conditional write in setStatus.ts lets exactly one writer win).
//   2. Every notice carries a dedupe_key, and migration 271 puts a UNIQUE index on
//      (user_id, metadata->>'dedupe_key'). The key is built from the change's own
//      stamp (its decided_at / submitted_at, or the provider session), so a repeat of
//      the same change, such as a provider re-delivering a webhook, hits the index
//      and is reported as 'duplicate', never inserted twice.
//   3. Webhook events are also de-duplicated by event id (lib/identity/webhook.ts).
//
// NOT a database transaction: supabase-js cannot span two writes. The notice is
// written right after the status change, and if that write fails the status stays
// changed. The failure is returned as 'failed' (and logged WITHOUT any row content,
// reason text or secret); the webhook caller turns it into an error so the provider
// re-delivers, which retries just the notice, safely, thanks to the key.
//
// Behind VERIFICATION_V2_ENABLED: while it is off nothing here touches the database.

import { identityRouting } from '@/config/identityRouting';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { describeNotSupported, describeRetryReason } from '@/lib/identity/messages';
import type { Db } from '@/lib/verification/setStatus';

export const VERIFICATION_PAGE = '/tutor/verification-v2';

export type NoticeKind =
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'more_info'
  | 'revoked'
  | 'reverification_required'
  | 'identity_failed';

export type TeacherNotice =
  | { kind: 'in_review' }
  | { kind: 'verified' }
  | { kind: 'rejected'; reason: string | null }
  | { kind: 'more_info'; reason: string | null }
  | { kind: 'revoked'; reason: string | null }
  | { kind: 'reverification_required' }
  | { kind: 'identity_failed'; status: 'retryable_failure' | 'not_supported' | 'consent_declined'; reason: string | null };

/** Identity outcomes the teacher is told about. Passed checks and cancellations are not. */
export const NOTIFIABLE_IDENTITY: ReadonlyArray<string> = ['retryable_failure', 'not_supported', 'consent_declined'];

export type NotifyStatus = 'sent' | 'duplicate' | 'skipped' | 'failed';

export interface NotifyResult {
  status: NotifyStatus;
}

const clip = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The wording and the notifications.type for each notice. Pure, so it is easy to test. */
export function buildNotice(
  notice: TeacherNotice,
  ctx: { attemptsLeft?: number } = {}
): { type: string; title: string; message: string } {
  switch (notice.kind) {
    case 'in_review':
      return {
        type: 'VERIFICATION_IN_REVIEW',
        title: 'Your verification is in review',
        message: 'We have your application. A reviewer will look at it soon, and you will see the decision on your verification page.',
      };
    case 'verified':
      return {
        type: 'VERIFICATION_APPROVED',
        title: 'You are verified',
        message: 'Your verification was approved. Your badges now show on your profile and classes.',
      };
    case 'rejected':
      return {
        type: 'VERIFICATION_REJECTED',
        title: 'Your verification was not approved',
        message: notice.reason
          ? `Reason: ${clip(notice.reason)} You can edit your application and submit it again.`
          : 'You can edit your application and submit it again.',
      };
    case 'more_info':
      return {
        type: 'VERIFICATION_MORE_INFO',
        title: 'We need more information',
        message: notice.reason
          ? `Reason: ${clip(notice.reason)} Update your application and send it again.`
          : 'Update your application and send it again.',
      };
    case 'revoked':
      return {
        type: 'VERIFICATION_REVOKED',
        title: 'Your verification was revoked',
        message: notice.reason
          ? `Reason: ${clip(notice.reason)} Your badges have been removed. Contact support if you think this is a mistake.`
          : 'Your badges have been removed. Contact support if you think this is a mistake.',
      };
    case 'reverification_required':
      return {
        type: 'VERIFICATION_REVERIFICATION_REQUIRED',
        title: 'Please verify again',
        message: 'We are asking teachers to verify again. Open your verification page to continue. Your badges are hidden until you do.',
      };
    case 'identity_failed': {
      const left = Math.max(0, ctx.attemptsLeft ?? 0);
      const attempts =
        left > 0 ? `You have ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : 'You have no attempts left. Please contact support.';
      if (notice.status === 'consent_declined') {
        return {
          type: 'VERIFICATION_CHECK_FAILED',
          title: 'Your identity check was declined',
          message: 'The identity check was declined, so we cannot continue. Please contact support.',
        };
      }
      if (notice.status === 'not_supported') {
        return {
          type: 'VERIFICATION_CHECK_FAILED',
          title: 'We could not check your ID this way',
          message: `${describeNotSupported(notice.reason)} ${attempts}`,
        };
      }
      return {
        type: 'VERIFICATION_CHECK_FAILED',
        title: 'Your identity check did not pass',
        message: `${describeRetryReason(notice.reason)} ${attempts}`,
      };
    }
  }
}

/**
 * The identity-check wrapper the three outcome paths share (webhook, page refresh,
 * reuse of an open session). Only failed checks are announced; everything else is
 * 'skipped' without a database call.
 */
export async function notifyIdentityOutcome(
  db: Db,
  tutorId: string,
  status: string,
  reason: string | null
): Promise<NotifyResult> {
  if (!NOTIFIABLE_IDENTITY.includes(status)) return { status: 'skipped' };
  return notifyTeacher(db, tutorId, {
    kind: 'identity_failed',
    status: status as 'retryable_failure' | 'not_supported' | 'consent_declined',
    reason,
  });
}

interface V2Stamp {
  submitted_at: string | null;
  decided_at: string | null;
  identity_attempts: number | null;
  identity_provider: string | null;
  identity_provider_session_ref: string | null;
  stripe_identity_session_id: string | null;
}

/**
 * Writes one notice. Never throws. Returns 'skipped' without touching the
 * database while the flag is off, 'duplicate' when this change was already
 * notified, 'failed' when the insert did not work.
 *
 * `stamp` overrides the change stamp read from the teacher's v2 row; pass it only
 * when there is no v2 row (an old-flow teacher), where the stamp is the time now.
 */
export async function notifyTeacher(
  db: Db,
  tutorId: string,
  notice: TeacherNotice,
  opts: { stamp?: string } = {}
): Promise<NotifyResult> {
  if (!isVerificationV2Enabled()) return { status: 'skipped' };

  try {
    const { data } = await db
      .from('tutor_verification_v2')
      .select('submitted_at, decided_at, identity_attempts, identity_provider, identity_provider_session_ref, stripe_identity_session_id')
      .eq('tutor_id', tutorId)
      .maybeSingle();
    const row = (data as V2Stamp | null) ?? null;

    let stamp: string;
    switch (notice.kind) {
      case 'in_review':
        stamp = row?.submitted_at ?? '';
        break;
      case 'identity_failed':
        stamp = `${row?.identity_provider_session_ref ?? row?.stripe_identity_session_id ?? ''}:${notice.status}`;
        break;
      default:
        stamp = row?.decided_at ?? '';
    }
    stamp = opts.stamp ?? (stamp || new Date().toISOString());

    const attemptsLeft =
      notice.kind === 'identity_failed' ? identityRouting.maxTotalAttempts - (row?.identity_attempts ?? 0) : undefined;
    const body = buildNotice(notice, { attemptsLeft });

    const { error } = await db.from('notifications').insert({
      user_id: tutorId,
      type: body.type,
      title: body.title,
      message: body.message,
      link: VERIFICATION_PAGE,
      is_read: false,
      metadata: { dedupe_key: `verification:${notice.kind}:${stamp}`, kind: notice.kind },
    });
    if (!error) return { status: 'sent' };
    if ((error as { code?: string }).code === '23505') return { status: 'duplicate' };
    // The code only: a database message can echo a row.
    console.error('[verification-notify] could not write the notice', { kind: notice.kind, code: (error as { code?: string }).code ?? 'unknown' });
    return { status: 'failed' };
  } catch {
    console.error('[verification-notify] could not write the notice', { kind: notice.kind, code: 'exception' });
    return { status: 'failed' };
  }
}
