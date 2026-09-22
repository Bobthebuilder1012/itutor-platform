// Releasing a "Secure your spot" hold nobody is going to pay.
//
// secure_spot_claim writes a SECURED_PENDING_PAYMENT row with a 30-minute
// pending_payment_expires_at, and until this file nothing ever acted on that
// expiry. The seat arithmetic ignored a lapsed hold (secure_spot_seats_used
// filters on the timestamp), so nobody else was blocked — but the student who
// abandoned the checkout was, permanently: /subscribe refuses while any
// SECURED_PENDING_PAYMENT row exists, and once the class starts the secure-spot
// route that could resume the hold is closed too. The only way out was a
// database edit.
//
// Two callers:
//   - /subscribe (lib/payments/groupSubscriptionCheckout.ts), the moment a
//     student with a lapsed hold asks to subscribe instead
//   - the secure-spot-transitions cron, which sweeps the rest
//
// THE ORDER MATTERS. The PaymentIntent is cancelled BEFORE the row is. A row
// cancelled while its intent can still be paid is money with nothing to attach
// it to: secure_spot_confirm refuses anything that is not
// SECURED_PENDING_PAYMENT. So if Stripe says the intent has succeeded or is
// processing, or the cancel fails, the hold is left exactly as it was — the
// webhook is still the only thing allowed to decide what a paid intent means.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/payments/stripeClient';

export const STALE_HOLD_REMOVAL_REASON = 'stale_secure_spot_hold';

export type ReleaseHoldOutcome =
  | { released: true }
  | {
      released: false;
      /**
       * still_open        the 30-minute window has not lapsed; the student may
       *                   be paying right now
       * payment_in_flight Stripe has the money, or is about to — the webhook
       *                   owns this row
       * not_a_hold        the row is no longer SECURED_PENDING_PAYMENT (paid,
       *                   released, or resumed under us)
       * stripe_unavailable an intent needs cancelling and Stripe could not be
       *                   reached or refused
       */
      reason: 'still_open' | 'payment_in_flight' | 'not_a_hold' | 'stripe_unavailable';
    };

// Intent states in which no money has moved and none can move once cancelled.
const CANCELLABLE = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

export async function releaseStaleSecureSpotHold(
  admin: SupabaseClient,
  enrollmentId: string,
  now: Date = new Date()
): Promise<ReleaseHoldOutcome> {
  const { data: hold, error: holdErr } = await admin
    .from('group_enrollments')
    .select('id, status, pending_payment_expires_at')
    .eq('id', enrollmentId)
    .maybeSingle();

  if (holdErr) throw new Error(`Could not read hold ${enrollmentId}: ${holdErr.message}`);
  if (!hold || (hold as any).status !== 'SECURED_PENDING_PAYMENT') {
    return { released: false, reason: 'not_a_hold' };
  }

  // NULL is treated as lapsed: a hold with no window has nothing to wait for.
  const expiresAt = (hold as any).pending_payment_expires_at as string | null;
  if (expiresAt && new Date(expiresAt).getTime() > now.getTime()) {
    return { released: false, reason: 'still_open' };
  }

  // Every intent this hold could still be paid through. NOT only PENDING rows:
  // resuming a hold (migration 214) retires the old payment row to 'expired'
  // and returns its intent as superseded_payment_intent_id, but the caller's
  // cancel of that intent (lib/payments/secureSpotCheckout.ts) is best-effort
  // and warns rather than fails — so an 'expired' row can still carry an
  // intent that has already succeeded, or that a network error left payable.
  // Checked here too, or a late webhook for it would find this hold already
  // CANCELLED and have nothing to do but refund a seat we could have honoured.
  const { data: payments, error: payErr } = await admin
    .from('subscription_payments')
    .select('id, status, stripe_payment_intent_id')
    .eq('enrollment_id', enrollmentId)
    .eq('type', 'secure_spot')
    .in('status', ['PENDING', 'expired']);

  if (payErr) throw new Error(`Could not read payments for hold ${enrollmentId}: ${payErr.message}`);

  // A PENDING row with no intent id recorded means paymentIntents.create
  // either never ran or its write-back at the end of createSecureSpotCheckout
  // never landed (a crash, a timeout) — there is nothing to look up, and
  // nothing was ever payable. Left alone rather than treated as suspicious:
  // refusing to release over a row that was never a real charge attempt would
  // bring back the exact permanent lockout this file exists to fix.
  const intentIds = new Set(
    (payments ?? [])
      .map((p: any) => p.stripe_payment_intent_id as string | null)
      .filter((id): id is string => Boolean(id))
  );

  if (intentIds.size > 0) {
    let stripe;
    try {
      stripe = getStripeClient();
    } catch {
      return { released: false, reason: 'stripe_unavailable' };
    }

    for (const intentId of intentIds) {
      try {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.status === 'canceled') continue;
        if (!CANCELLABLE.has(intent.status)) {
          // succeeded, processing, requires_capture: money has moved or is
          // moving. Leave the row for the webhook.
          console.warn('[secure-spot] hold not released, intent is', intent.status, {
            enrollmentId,
            intentId,
          });
          return { released: false, reason: 'payment_in_flight' };
        }
        await stripe.paymentIntents.cancel(intentId, { cancellation_reason: 'abandoned' });
      } catch (err) {
        console.error('[secure-spot] could not cancel intent for stale hold', {
          enrollmentId,
          intentId,
          error: (err as Error)?.message,
        });
        return { released: false, reason: 'stripe_unavailable' };
      }
    }
  }

  // Guarded on the status AND the expiry this function already decided was
  // lapsed — not status alone. Between the read above and here, the student
  // may have pressed "Secure your spot" again: secure_spot_claim (migration
  // 214) resumes the SAME row with a fresh 30-minute window and a new payment
  // row. That resumed row still has status SECURED_PENDING_PAYMENT, so a
  // status-only guard would cancel it out from under the student's live
  // checkout. Requiring the expiry to still be lapsed (the same .or() the
  // cron sweep uses) makes the update affect zero rows in that case, and
  // Postgres re-evaluates the whole WHERE after any lock wait, so this is
  // correct even when the resume and this release land at the same instant.
  const { data: cancelled, error: cancelErr } = await admin
    .from('group_enrollments')
    .update({
      status: 'CANCELLED',
      pending_payment_expires_at: null,
      cancelled_at: now.toISOString(),
      removal_reason: STALE_HOLD_REMOVAL_REASON,
    })
    .eq('id', enrollmentId)
    .eq('status', 'SECURED_PENDING_PAYMENT')
    .or(`pending_payment_expires_at.is.null,pending_payment_expires_at.lte.${now.toISOString()}`)
    .select('id');

  if (cancelErr) throw new Error(`Could not release hold ${enrollmentId}: ${cancelErr.message}`);
  if (!cancelled?.length) return { released: false, reason: 'not_a_hold' };

  // Only PENDING rows are expired — an already-'expired' row needs no change,
  // and this must not touch a payment row a concurrent resume just inserted.
  const paymentIds = (payments ?? [])
    .filter((p: any) => p.status === 'PENDING')
    .map((p: any) => p.id as string);
  if (paymentIds.length > 0) {
    const { error: expireErr } = await admin
      .from('subscription_payments')
      .update({ status: 'expired' })
      .in('id', paymentIds)
      .eq('status', 'PENDING');
    // The seat is already released and every intent cancelled, so a PENDING
    // payment row left behind cannot take money. Logged, not thrown.
    if (expireErr) {
      console.error('[secure-spot] released hold but could not expire its payments', {
        enrollmentId,
        error: expireErr.message,
      });
    }
  }

  return { released: true };
}
