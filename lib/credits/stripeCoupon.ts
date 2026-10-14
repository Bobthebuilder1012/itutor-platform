// How credits reach a Stripe invoice: a single-use amount_off TTD coupon with
// duration 'once', named in the reservation it carries. The ledger is the
// source of truth; the coupon is only the delivery mechanism. Stripe's
// customer balance is deliberately not used: it belongs to the customer, not
// to one subscription, and sits outside the credit ledger.
//
// AMOUNTS ARE INTEGER CENTS THROUGHOUT. A coupon is sized as
//   amount_off = (what this invoice would cost without credits) − (cash to charge)
// so the invoice lands on the quoted card charge to the cent. The "without
// credits" figure is read from Stripe itself — the Price's real unit_amount
// less any promotion coupon (a new subscription), or the upcoming invoice's
// total (a renewal) — never recomputed, because a cached Price can predate a
// fee-schedule change.
//
// Existing discounts on a subscription are carried by their discount id
// ({discount: 'di_…'}), never re-applied by coupon: the promotion coupons are
// single-use (max_redemptions 1), so re-applying one would fail.

import type Stripe from 'stripe';

export async function createCreditCoupon(
  stripe: Stripe,
  params: {
    amountOffCents: number;
    spendId: string;
    idempotencyKey: string;
    paymentId?: string | null;
  }
): Promise<Stripe.Coupon> {
  if (!Number.isInteger(params.amountOffCents) || params.amountOffCents <= 0) {
    throw new Error(`[credits] invalid coupon amount: ${params.amountOffCents}`);
  }
  return stripe.coupons.create(
    {
      amount_off: params.amountOffCents,
      currency: 'ttd',
      duration: 'once',
      max_redemptions: 1,
      name: 'iTutor credits',
      metadata: {
        kind: 'itutor_credits',
        credit_spend_id: params.spendId,
        ...(params.paymentId ? { payment_id: params.paymentId } : {}),
      },
    },
    { idempotencyKey: params.idempotencyKey }
  );
}

/** Cancel a subscription that never got paid. Ignores "already gone". */
export async function cancelIncompleteSubscription(stripe: Stripe, subscriptionId: string): Promise<void> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.status === 'incomplete') await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    console.warn(`[credits] could not cancel incomplete subscription ${subscriptionId}:`, err);
  }
}
