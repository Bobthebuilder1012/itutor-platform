// =====================================================
// LUNIPAY CLIENT
// =====================================================
// Thin wrapper over the official `lunipay` Node SDK.
// Used by /api/payments/lunipay/* routes.
//
// Env vars required:
//   LUNIPAY_SECRET_KEY      `sk_test_…` or `sk_live_…`
//   LUNIPAY_WEBHOOK_SECRET  `whsec_…` from the webhook endpoint config
//
// LuniPay is "Powered by Stripe" — every checkout session is backed
// by a Stripe PaymentIntent. The Stripe id is surfaced as
// `payment_intent_id` on the session if you need to dig into the
// underlying processor record.
// =====================================================

import LuniPay, { type CheckoutSession } from 'lunipay';

/**
 * Mirrors the `payments.status` CHECK constraint defined in
 * supabase/migrations/020_payments_system.sql.
 */
export type DbPaymentStatus =
  | 'initiated'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'cancelled';

let _client: LuniPay | null = null;

/**
 * Lazily-constructed singleton. Throws at first use if the env var
 * is missing — never silently.
 */
export function getLunipayClient(): LuniPay {
  if (_client) return _client;
  const apiKey = process.env.LUNIPAY_SECRET_KEY;
  if (!apiKey) {
    throw new Error('[lunipay] LUNIPAY_SECRET_KEY is not configured');
  }
  _client = new LuniPay({ apiKey });
  return _client;
}

/**
 * Maps a LuniPay checkout session to our internal payments enum.
 * - OPEN     + unpaid  → requires_action
 * - COMPLETE + paid    → succeeded
 * - EXPIRED            → cancelled
 * - Anything else      → requires_action (treat as still pending)
 */
export function mapCheckoutSessionToDbStatus(
  session: Pick<CheckoutSession, 'status' | 'payment_status'>
): DbPaymentStatus {
  if (session.status === 'COMPLETE' && session.payment_status === 'paid') {
    return 'succeeded';
  }
  if (session.status === 'EXPIRED') {
    return 'cancelled';
  }
  if (session.payment_status === 'paid') {
    // Edge case: status not yet COMPLETE but payment_status flipped.
    return 'succeeded';
  }
  return 'requires_action';
}

/**
 * Converts a TTD decimal amount (e.g. 25.00) to integer cents (2500).
 * Rounds half-away-from-zero to dodge floating-point drift.
 */
export function ttdToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`[lunipay] Invalid TTD amount: ${amount}`);
  }
  return Math.round(amount * 100);
}

/**
 * Converts integer cents back to a TTD decimal number.
 */
export function centsToTtd(cents: number): number {
  return Math.round(cents) / 100;
}
