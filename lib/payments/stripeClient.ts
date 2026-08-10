// =====================================================
// STRIPE CLIENT
// =====================================================
// Thin wrapper over the official `stripe` Node SDK.
// Used by /api/payments/stripe/* routes.
//
// Env vars required:
//   STRIPE_SECRET_KEY                   `sk_test_…` or `sk_live_…`
//   STRIPE_WEBHOOK_SECRET               `whsec_…` from the endpoint config
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  `pk_test_…` (browser, Payment Element)
//
// The webhook secret differs per endpoint: the one printed by
// `stripe listen` (local CLI forwarding) is NOT the one issued for a
// deployed endpoint in the Dashboard. Each environment gets its own.
// =====================================================

import Stripe from 'stripe';

/**
 * Mirrors the `payments.status` CHECK constraint defined in
 * supabase/migrations/020_payments_system.sql, as extended by
 * migration 152 (partially_refunded).
 */
export type DbPaymentStatus =
  | 'initiated'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

let _client: Stripe | null = null;

/**
 * Lazily-constructed singleton. Throws at first use if the env var
 * is missing — never silently.
 */
export function getStripeClient(): Stripe {
  if (_client) return _client;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('[stripe] STRIPE_SECRET_KEY is not configured');
  }
  _client = new Stripe(apiKey, {
    // Pin the API version so a Stripe-side upgrade can't change
    // response shapes underneath us without a deliberate bump.
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
    appInfo: { name: 'iTutor', url: 'https://myitutor.com' },
  });
  return _client;
}

/**
 * Maps a Stripe PaymentIntent status to our internal payments enum.
 *
 * Stripe statuses:
 *   requires_payment_method | requires_confirmation | requires_action
 *   | processing | requires_capture | succeeded | canceled
 */
export function mapPaymentIntentToDbStatus(
  status: Stripe.PaymentIntent.Status
): DbPaymentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'cancelled';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
    case 'processing':
    default:
      // Everything non-terminal is "still pending" from our side. We
      // only ever flip to succeeded from the webhook, never from a
      // client-reported result.
      return 'requires_action';
  }
}

/**
 * Converts a TTD decimal amount (e.g. 25.00) to integer cents (2500).
 * Rounds half-away-from-zero to dodge floating-point drift.
 *
 * TTD is a two-decimal currency, so Stripe's smallest unit is cents.
 */
export function ttdToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`[stripe] Invalid TTD amount: ${amount}`);
  }
  return Math.round(amount * 100);
}

/**
 * Converts integer cents back to a TTD decimal number.
 */
export function centsToTtd(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Pulls the processing fee off an expanded charge.
 *
 * Stripe reports balance_transaction amounts in the SETTLEMENT
 * currency, which is not necessarily the TTD presentment currency.
 * When they differ we convert using the balance transaction's own
 * exchange_rate so the stored figure is comparable to amount_ttd.
 *
 * Returns nulls rather than throwing — fee capture is for
 * reconciliation and must never fail a payment confirmation.
 */
export function extractChargeFees(charge: Stripe.Charge): {
  feeTtd: number | null;
  netTtd: number | null;
  balanceTxnId: string | null;
  settlementCurrency: string | null;
} {
  const txn = charge.balance_transaction;

  if (!txn || typeof txn === 'string') {
    // Not expanded — caller should have requested it.
    return {
      feeTtd: null,
      netTtd: null,
      balanceTxnId: typeof txn === 'string' ? txn : null,
      settlementCurrency: null,
    };
  }

  const settlementCurrency = String(txn.currency || '').toLowerCase();
  const isTtd = settlementCurrency === 'ttd';

  // exchange_rate is settlement-per-presentment. When settlement is
  // already TTD it's null and no conversion is needed.
  const rate = txn.exchange_rate;

  const toTtd = (minorUnits: number): number | null => {
    if (isTtd) return centsToTtd(minorUnits);
    if (!rate || rate <= 0) return null; // can't convert reliably
    return Math.round((minorUnits / rate)) / 100;
  };

  return {
    feeTtd: toTtd(txn.fee),
    netTtd: toTtd(txn.net),
    balanceTxnId: txn.id,
    settlementCurrency: isTtd ? null : settlementCurrency,
  };
}
