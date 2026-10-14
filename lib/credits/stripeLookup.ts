// Small Stripe reads the credit programme needs. Server-only.
//
// API version 2026-07-29.dahlia moved things: invoice.payment_intent and
// invoice.charge are null, so an invoice's charge is reached through the
// invoice's payments list, and a discount's coupon through
// total_discount_amounts[].discount.source.coupon.

import type Stripe from 'stripe';

const idOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: string }).id) : null;

/** The PaymentIntent and charge that paid an invoice, when there was one. */
export async function invoicePaymentRefs(
  stripe: Stripe,
  invoiceId: string
): Promise<{ paymentIntentId: string | null; chargeId: string | null }> {
  const list = await stripe.invoicePayments.list({
    invoice: invoiceId,
    limit: 10,
    expand: ['data.payment.payment_intent'],
  });
  const paid = list.data.find((p) => p.status === 'paid') ?? list.data[0];
  const payment = paid?.payment as { payment_intent?: unknown; charge?: unknown } | undefined;
  const pi = payment?.payment_intent;
  const paymentIntentId = idOf(pi);
  const chargeId =
    idOf(payment?.charge) ??
    (pi && typeof pi === 'object' ? idOf((pi as { latest_charge?: unknown }).latest_charge) : null);
  return { paymentIntentId, chargeId };
}

/** Card fingerprint and customer behind a payment. Nulls when not a card. */
export async function paymentCardFingerprint(
  stripe: Stripe,
  refs: { chargeId?: string | null; paymentIntentId?: string | null }
): Promise<{ fingerprint: string | null; customerId: string | null }> {
  let charge: Stripe.Charge | null = null;
  if (refs.chargeId) {
    charge = await stripe.charges.retrieve(refs.chargeId);
  } else if (refs.paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(refs.paymentIntentId, { expand: ['latest_charge'] });
    charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? (pi.latest_charge as Stripe.Charge) : null;
  }
  if (!charge) return { fingerprint: null, customerId: null };
  return {
    fingerprint: charge.payment_method_details?.card?.fingerprint ?? null,
    customerId: idOf(charge.customer),
  };
}

/** Fingerprints of every card saved on a customer. */
export async function customerCardFingerprints(stripe: Stripe, customerId: string): Promise<string[]> {
  const out: string[] = [];
  for await (const pm of stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 100 })) {
    if (pm.card?.fingerprint) out.push(pm.card.fingerprint);
  }
  return out;
}

/**
 * Coupon ids discounting an invoice, with the amount each took. Used to prove
 * a credit coupon actually reached an invoice before booking it as credits.
 */
export async function invoiceCouponDiscounts(
  stripe: Stripe,
  invoiceId: string
): Promise<Array<{ couponId: string; amountCents: number }>> {
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['total_discount_amounts.discount'] });
  const out: Array<{ couponId: string; amountCents: number }> = [];
  for (const t of invoice.total_discount_amounts ?? []) {
    const discount = t.discount;
    if (!discount || typeof discount === 'string') continue;
    const couponId = idOf((discount as Stripe.Discount).source?.coupon);
    if (couponId) out.push({ couponId, amountCents: t.amount });
  }
  return out;
}
