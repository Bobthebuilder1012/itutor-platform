// Stripe hosted Checkout for the parent-approval flow — handover §4.4.
//
// Decision 3 puts all payments on Stripe Checkout (hosted). The pre-existing
// Stripe integration in this repo is PaymentIntent + Payment Element
// (/api/payments/stripe/initiate), which is a different product and is left
// exactly as it is; this module adds the hosted-Checkout path the parent flow
// needs rather than converting anything. LuniPay is the only place hosted
// checkout sessions existed before, and it is being retired (§11).
//
// Two shapes, per §4.4:
//   1:1          mode: 'payment'
//   group class  mode: 'subscription', first charge only (decision 11)
//
// The amount always comes from bookings.frozen_price and is never recomputed
// (decision 10). The tutor may have raised their rate since the child asked;
// the parent agreed to the figure they were shown.

import type Stripe from 'stripe';
import { getStripeClient, ttdToCents } from './stripeClient';

export type ApprovalCheckoutInput = {
  bookingId: string;
  /** Decision 10 — the frozen figure, in TTD. */
  amountTtd: number;
  mode: 'payment' | 'subscription';
  description: string;
  parentId: string;
  studentId: string;
  /** Where the parent lands afterwards. §4.4: back to the approval surface. */
  successUrl: string;
  cancelUrl: string;
  parentEmail?: string | null;
  /** Reuse instead of creating a duplicate session. */
  existingSessionId?: string | null;
};

export type ApprovalCheckoutResult =
  | { ok: true; sessionId: string; url: string; reused: boolean }
  | { ok: false; reason: string };

/**
 * Creates (or re-uses) the Checkout session for an approval.
 *
 * Re-use rather than an idempotency key: a Stripe idempotency key replayed with
 * different parameters is rejected outright, and a key replayed after the
 * session expired hands back the dead session — so a parent who left checkout
 * on Monday and came back on Tuesday would be stuck with an unusable URL and no
 * way to pay. Looking the stored session up and checking whether it is still
 * `open` handles both: still open, same link; expired or complete, a fresh one.
 */
export async function createApprovalCheckoutSession(
  input: ApprovalCheckoutInput
): Promise<ApprovalCheckoutResult> {
  const stripe = getStripeClient();

  if (input.existingSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(input.existingSessionId);
      if (existing.status === 'open' && existing.url) {
        return { ok: true, sessionId: existing.id, url: existing.url, reused: true };
      }
      if (existing.status === 'complete') {
        // Already paid. The caller must not send them round again.
        return { ok: false, reason: 'already_paid' };
      }
    } catch {
      // Unknown/foreign session id — fall through and make a new one.
    }
  }

  if (!Number.isFinite(input.amountTtd) || input.amountTtd <= 0) {
    return { ok: false, reason: 'nothing_to_charge' };
  }

  // Metadata is how the webhook finds its way back to the booking. It is set on
  // the session AND on the resulting payment intent / subscription, because
  // checkout.session.completed is not the only event that may arrive first.
  const metadata: Record<string, string> = {
    itutor_flow: 'parent_approval',
    booking_id: input.bookingId,
    parent_id: input.parentId,
    student_id: input.studentId,
  };

  try {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: input.mode,
      // §4.4: both return to the approval surface. The session id lets that page
      // tell success from an abandoned tab without trusting a query flag alone.
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.bookingId,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'ttd',
            unit_amount: ttdToCents(input.amountTtd),
            product_data: { name: input.description },
            ...(input.mode === 'subscription'
              ? { recurring: { interval: 'month' as const } }
              : {}),
          },
        },
      ],
      ...(input.parentEmail ? { customer_email: input.parentEmail } : {}),
      ...(input.mode === 'payment'
        ? { payment_intent_data: { metadata } }
        : { subscription_data: { metadata } }),
    };

    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) return { ok: false, reason: 'stripe_returned_no_url' };
    return { ok: true, sessionId: session.id, url: session.url, reused: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'stripe_error';
    console.error('[parentApprovalCheckout] session create failed:', msg);
    return { ok: false, reason: msg };
  }
}

/**
 * §4.5 second path: capacity was gone at fulfilment, money has already been
 * taken, so it goes back automatically.
 *
 * "The second path is rare and must not be skipped. Without it a parent is
 * charged for nothing and the only trace is a Stripe dashboard row."
 */
export async function refundCheckoutSession(
  sessionId: string
): Promise<{ ok: boolean; refundId?: string; reason?: string }> {
  const stripe = getStripeClient();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const pi = session.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;

    if (!paymentIntentId) {
      // A subscription checkout settles through an invoice rather than a bare
      // payment intent. Cancel the subscription and refund its first invoice.
      const sub = session.subscription;
      const subId = typeof sub === 'string' ? sub : sub?.id;
      if (!subId) return { ok: false, reason: 'nothing_to_refund' };

      await stripe.subscriptions.cancel(subId);
      const invoices = await stripe.invoices.list({ subscription: subId, limit: 1 });
      const invoice = invoices.data[0];
      if (!invoice) return { ok: false, reason: 'no_invoice_on_subscription' };

      // Invoice.charge and Invoice.payment_intent were both removed from the
      // Invoice object in recent API versions (this client pins
      // 2026-07-29.dahlia), and which field carries the settlement moved to
      // `payments`. Read all three shapes defensively rather than pinning this
      // refund path to one version — an API bump must not silently disable the
      // one code path that gives a parent their money back.
      const loose = invoice as unknown as {
        charge?: string | { id: string } | null;
        payment_intent?: string | { id: string } | null;
        payments?: { data?: Array<{ payment?: { payment_intent?: string | { id: string } | null } }> };
      };

      const idOf = (v: string | { id: string } | null | undefined): string | null =>
        typeof v === 'string' ? v : (v?.id ?? null);

      const chargeId = idOf(loose.charge);
      if (chargeId) {
        const refund = await stripe.refunds.create({
          charge: chargeId,
          reason: 'requested_by_customer',
        });
        return { ok: true, refundId: refund.id };
      }

      const invoicePi =
        idOf(loose.payment_intent) ??
        idOf(loose.payments?.data?.[0]?.payment?.payment_intent);

      if (!invoicePi) return { ok: false, reason: 'no_settlement_on_invoice' };

      const refund = await stripe.refunds.create({
        payment_intent: invoicePi,
        reason: 'requested_by_customer',
      });
      return { ok: true, refundId: refund.id };
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    });
    return { ok: true, refundId: refund.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'refund_failed';
    console.error('[parentApprovalCheckout] auto-refund failed:', msg);
    return { ok: false, reason: msg };
  }
}
