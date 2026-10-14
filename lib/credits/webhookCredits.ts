// The credit programme's part of the Stripe webhook. Each helper is safe to
// call when migration 268 is absent (it finds nothing) and never throws into
// the webhook.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { invoiceCouponDiscounts } from '@/lib/credits/stripeLookup';
import { releaseCredits, safely } from '@/lib/credits/wallet';
import { onSubscriptionPaymentRefunded } from '@/lib/credits/refunds';

export interface InvoiceCreditSpend {
  spendId: string;
  /** The renewal's full price — what the tutor is paid on. */
  baseTtd: number;
  creditsTtd: number;
}

/**
 * The "apply credits to my next payment" reservation this renewal invoice
 * carried, PROVEN by the invoice: one of its discounts must be that
 * reservation's coupon. Matching on the subscription alone is not enough — a
 * coupon attached after the invoice was drafted lands on the NEXT invoice,
 * and booking it here would record credits that were never applied.
 */
export async function creditSpendForInvoice(
  admin: SupabaseClient,
  invoiceId: string,
  subscriptionId: string
): Promise<InvoiceCreditSpend | null> {
  try {
    const { data: spends, error } = await admin
      .from('credit_ledger')
      .select('id, amount_ttd, stripe_coupon_id, context, state')
      .eq('kind', 'spend')
      .in('state', ['reserved', 'settled', 'released'])
      .not('stripe_coupon_id', 'is', null)
      .eq('context->>stripe_subscription_id', subscriptionId)
      .eq('context->>scenario', 'A');
    if (error || !spends || spends.length === 0) return null;

    const discounts = await invoiceCouponDiscounts(getStripeClient(), invoiceId);
    const match = spends.find((s) => discounts.some((d) => d.couponId === s.stripe_coupon_id));
    if (!match) return null;
    const ctx = (match.context ?? {}) as { base_ttd?: number };
    if (!Number.isFinite(Number(ctx.base_ttd))) return null;
    return { spendId: match.id, baseTtd: Number(ctx.base_ttd), creditsTtd: -Number(match.amount_ttd) };
  } catch (err) {
    console.error('[credits/webhook] invoice credit lookup failed:', err);
    return null;
  }
}

/** A subscription ended: credits still waiting for its next invoice go back. */
export async function releaseSubscriptionReservations(admin: SupabaseClient, subscriptionId: string): Promise<number> {
  try {
    const { data: spends, error } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('kind', 'spend')
      .eq('state', 'reserved')
      .eq('context->>stripe_subscription_id', subscriptionId);
    if (error || !spends) return 0;
    let released = 0;
    for (const s of spends) {
      const r = await safely('release on subscription end', () => releaseCredits(admin, s.id));
      if (r === 'released') released += 1;
    }
    return released;
  } catch {
    return 0;
  }
}

/**
 * charge.refunded for a GROUP payment (subscription invoice, secured spot,
 * credit month). Only the credit effects: restoring spent credits and
 * clawing back a referral reward. Returns false when the charge is not one of
 * ours, so the caller can carry on with its own "not found" handling.
 *
 * The payment's status and the tutor's payout are NOT changed here — Stripe
 * subscription refunds have never been handled by this webhook, and an admin
 * still reconciles them with the reverse route.
 */
export async function creditsForRefundedCharge(admin: SupabaseClient, charge: Stripe.Charge): Promise<boolean> {
  try {
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
    let query = admin.from('subscription_payments').select('id').limit(1);
    query = intentId
      ? query.or(`stripe_payment_intent_id.eq.${intentId},stripe_charge_id.eq.${charge.id}`)
      : query.eq('stripe_charge_id', charge.id);
    const { data } = await query.maybeSingle();
    if (!data) return false;
    await onSubscriptionPaymentRefunded(admin, data.id as string, {
      full: charge.amount_refunded >= charge.amount,
      source: 'stripe_charge_refunded',
    });
    return true;
  } catch (err) {
    console.error('[credits/webhook] refund handling failed:', err);
    return false;
  }
}
