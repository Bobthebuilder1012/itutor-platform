// =====================================================
// Secure your spot — confirmation.
//
// Called from the Stripe webhook when a securing payment succeeds.
// Modelled on handleSubscriptionPayment: the webhook branch stays thin,
// the logic lives here, and the caller distinguishes transient failures
// (retry) from terminal ones (dedupe and move on).
//
// The webhook is the only writer of payment state. Nothing here is ever
// driven by the browser's confirmPayment result.
// =====================================================

import { type SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/payments/stripeClient';
import {
  computeReleaseDate,
  firstUpcomingSession,
  preorderEligibility,
  preorderReasonMessage,
} from '@/lib/payments/secureSpot';
import type { SessionPattern } from '@/lib/utils/scheduleFormat';

export interface ConfirmSecuredSpotParams {
  admin: SupabaseClient;
  enrollmentId: string;
  stripePaymentIntentId: string;
  source?: 'webhook' | 'manual';
}

export interface ConfirmSecuredSpotResult {
  ok: boolean;
  idempotent?: boolean;
  enrollmentId?: string;
  releaseDate?: string | null;
  refunded?: boolean;
  /** Set when the caller should let Stripe retry rather than dedupe. */
  transient?: boolean;
  error?: string;
}

const SESSION_COLUMNS =
  'recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on';

/**
 * May this class open preorders?
 *
 * Shared by both settings routes so the rule is enforced once. This is the
 * flag that lets a class take money before it has taught anything, so it is
 * never taken on the client's word — and "no schedule" is refused outright,
 * because a payment CTA next to "schedule to be confirmed" is indefensible in
 * a dispute.
 */
export async function canOpenPreorders(
  admin: SupabaseClient,
  groupId: string
): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const { data: sessions, error } = await admin
    .from('group_sessions')
    .select(SESSION_COLUMNS)
    .eq('group_id', groupId);

  if (error) {
    return { ok: false, reason: 'lookup_failed', message: 'Could not read the class schedule.' };
  }

  const eligibility = preorderEligibility((sessions ?? []) as SessionPattern[]);
  if (eligibility.eligible) return { ok: true };

  return { ok: false, reason: eligibility.reason, message: preorderReasonMessage(eligibility.reason) };
}

/**
 * Turn a paid securing charge into a held seat.
 *
 * The class start is read from the schedule at confirmation time and the
 * release date is computed from it ONCE, here, then stored. It is never
 * recomputed later from groups.end_date: a tutor who kept extending the class
 * would otherwise never be paid, and one who shortened it would be paid for a
 * month they had not taught.
 */
export async function confirmSecuredSpot(
  params: ConfirmSecuredSpotParams
): Promise<ConfirmSecuredSpotResult> {
  const { admin, enrollmentId, stripePaymentIntentId } = params;

  const { data: enrollment, error: enrErr } = await admin
    .from('group_enrollments')
    .select('id, group_id, student_id, status')
    .eq('id', enrollmentId)
    .maybeSingle();

  if (enrErr) return { ok: false, transient: true, error: `rpc_failed: ${enrErr.message}` };
  if (!enrollment) return { ok: false, error: 'enrollment_not_found' };

  // Already secured by an earlier delivery of the same event.
  if ((enrollment as any).status === 'SECURED') {
    return { ok: true, idempotent: true, enrollmentId };
  }

  const { data: group, error: grpErr } = await admin
    .from('groups')
    .select('id, name, tutor_id, end_date')
    .eq('id', (enrollment as any).group_id)
    .maybeSingle();

  if (grpErr) return { ok: false, transient: true, error: `rpc_failed: ${grpErr.message}` };
  if (!group) return { ok: false, error: 'group_not_found' };

  const { data: sessions, error: sesErr } = await admin
    .from('group_sessions')
    .select(SESSION_COLUMNS)
    .eq('group_id', (enrollment as any).group_id);

  if (sesErr) return { ok: false, transient: true, error: `rpc_failed: ${sesErr.message}` };

  // A class that lost its schedule between checkout and payment cannot be
  // dated, and money we cannot date is money we must not hold. Refund.
  const firstSession = firstUpcomingSession((sessions ?? []) as SessionPattern[]);
  if (!firstSession) {
    const refunded = await refundSecuringCharge(stripePaymentIntentId);
    await releaseClaim(admin, enrollmentId, 'schedule_removed');
    return { ok: false, error: 'no_schedule', refunded };
  }

  const releaseDate = computeReleaseDate({
    firstSession,
    endDate: (group as any).end_date ?? null,
  });

  const { data: rpc, error: rpcErr } = await (admin as any).rpc('secure_spot_confirm', {
    p_payload: {
      enrollment_id: enrollmentId,
      payment_intent_id: stripePaymentIntentId,
      release_date: releaseDate,
      period_start: firstSession.toISOString(),
      period_end: `${releaseDate}T23:59:59.000Z`,
    },
  });

  // Transient: let Stripe retry rather than leaving a paid student unseated.
  if (rpcErr) return { ok: false, transient: true, error: `rpc_failed: ${rpcErr.message}` };

  if (rpc?.ok === false && rpc?.reason === 'oversubscribed') {
    // Both students passed the claim check and both paid. The later webhook
    // loses the seat and gets their money back automatically — overfilling
    // the class or keeping the money would both be worse.
    const refunded = await refundSecuringCharge(stripePaymentIntentId);
    await releaseClaim(admin, enrollmentId, 'oversubscribed');
    return { ok: false, error: 'oversubscribed', refunded, enrollmentId };
  }

  if (rpc?.ok === false) {
    return { ok: false, error: String(rpc?.reason ?? 'confirm_failed'), enrollmentId };
  }

  return {
    ok: true,
    idempotent: rpc?.idempotent === true,
    enrollmentId,
    releaseDate,
  };
}

/**
 * Refund every secured spot in a class, because the class is going away.
 *
 * The deal a student accepted was "your money is held until the first month is
 * taught, and if the tutor cancels before it starts you're refunded
 * automatically". This is the code that keeps the second half of that promise,
 * so it is called from every path that archives or deletes a class rather than
 * from one of them.
 *
 * Best-effort per student and never throws: one card that refuses a refund
 * must not stop the other students being refunded, or block the deletion the
 * tutor asked for. Failures are logged loudly and left in the ledger as
 * 'owed' so they surface rather than vanish.
 */
export async function refundSecuredSpotsForClass(
  admin: SupabaseClient,
  groupId: string,
  reason: string
): Promise<{ refunded: number; failed: number }> {
  const out = { refunded: 0, failed: 0 };

  const { data: secured, error } = await admin
    .from('group_enrollments')
    .select('id, student_id, secure_payment_intent_id')
    .eq('group_id', groupId)
    .eq('status', 'SECURED');

  if (error || !secured?.length) return out;

  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle();

  for (const enrolment of secured) {
    const pi = (enrolment as any).secure_payment_intent_id as string | null;
    let refunded = true;

    // A free reservation has no payment intent — there is nothing to refund,
    // but the seat and the enrolment still have to be closed out.
    if (pi) refunded = await refundSecuringCharge(pi);

    await releaseClaim(admin, (enrolment as any).id, reason);

    // Reverse the tutor's held money. It was never theirs to keep: they are
    // not teaching the class.
    const { data: payment } = await admin
      .from('subscription_payments')
      .select('id, tutor_payout_ttd')
      .eq('enrollment_id', (enrolment as any).id)
      .eq('type', 'secure_spot')
      .maybeSingle();

    if (payment?.id) {
      await admin
        .from('payout_ledger')
        .update({ status: 'reversed', updated_at: new Date().toISOString() })
        .eq('subscription_payment_id', payment.id)
        .eq('status', 'owed');
    }

    await admin.from('notifications').insert({
      user_id: (enrolment as any).student_id,
      type: 'secure_spot_refunded',
      title: 'Your reserved place has been refunded',
      message: `${group?.name ?? 'A class'} was cancelled before it started, so your payment has been refunded in full.`,
      group_id: groupId,
      metadata: { groupId, enrollmentId: (enrolment as any).id, reason },
    });

    if (refunded) out.refunded += 1;
    else out.failed += 1;
  }

  if (out.failed > 0) {
    console.error('[secureSpot] some refunds failed and need manual attention', {
      groupId, ...out,
    });
  }
  return out;
}

/**
 * Refund a securing charge in full.
 *
 * Returns false rather than throwing: a failed refund must not stop us from
 * releasing the seat and recording the outcome, or the student ends up with
 * neither a seat nor a refund and no record of either.
 */
async function refundSecuringCharge(paymentIntentId: string): Promise<boolean> {
  try {
    const stripe = getStripeClient();
    await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `secure-refund-${paymentIntentId}` }
    );
    return true;
  } catch (err) {
    console.error('[secureSpot] refund failed — needs manual attention', {
      paymentIntentId,
      error: (err as Error)?.message,
    });
    return false;
  }
}

/** Give the seat back and mark the payment refunded. Never leaves it SECURED. */
async function releaseClaim(admin: SupabaseClient, enrollmentId: string, reason: string) {
  await admin
    .from('group_enrollments')
    .update({
      status: 'CANCELLED',
      payment_status: 'REFUNDED',
      pending_payment_expires_at: null,
      cancelled_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq('id', enrollmentId);

  await admin
    .from('subscription_payments')
    .update({ status: 'REFUNDED', refunded_at: new Date().toISOString() })
    .eq('enrollment_id', enrollmentId)
    .eq('type', 'secure_spot');
}
