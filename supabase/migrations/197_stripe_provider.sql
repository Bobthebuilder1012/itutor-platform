-- ============================================================
-- MIGRATION 197: STRIPE PROVIDER (one-on-one sessions)
-- iTutor Database
-- ============================================================
--
-- Adds direct-Stripe support alongside the existing LuniPay
-- integration. Deliberately modelled on migration 134
-- (LuniPay provider) so both gateways share the same
-- payments / payout_ledger / tutor_earnings / tutor_balances
-- tables and the charge -> ledger trigger from migration 163.
--
-- Purely additive:
--   * adds `stripe_*` provider handles to `payments`
--   * adds the `stripe_webhook_events` de-dup table
--   * does NOT flip the `provider` default (stays 'lunipay'
--     until the cutover is signed off)
--
-- SCOPE: one-on-one session payments only. Subscriptions stay
-- on LuniPay for now.
--
-- NOTE ON PAYOUTS: we do NOT write payout_ledger from the
-- Stripe webhook. payout_ledger.session_id is NOT NULL UNIQUE
-- and no session row exists at payment time — ledger rows are
-- created by fn_create_earning_on_charge when sessions.charged_at
-- is set (migration 163). Stripe's processing fee is recorded on
-- the payments row for reconciliation only.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Add Stripe-specific columns to `payments`
-- ============================================================

ALTER TABLE payments
  -- Stripe provider handles
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id           text,
  ADD COLUMN IF NOT EXISTS stripe_balance_txn_id      text,
  -- Stripe's actual processing fee, converted to TTD from the
  -- balance_transaction. Recorded for reconciliation against the
  -- grossed-up fee we charged the student (see lib/payments/grossUp.ts).
  -- If settlement currency != TTD this is the converted value and
  -- WILL drift slightly from the charged gross-up.
  ADD COLUMN IF NOT EXISTS stripe_fee_ttd             numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net_ttd             numeric(10,2),
  -- Currency Stripe actually settled in, when it differs from the
  -- TTD presentment currency. Confirmed USD for the live account
  -- (US entity, default_currency=usd), so this is normally 'usd'.
  -- NULL means "settled in TTD".
  ADD COLUMN IF NOT EXISTS stripe_settlement_currency text,
  -- FEE RECONCILIATION
  -- What we added to the student's charge as the processing fee
  -- (lib/payments/grossUp.ts), vs what Stripe actually took. The
  -- gross-up rate is an ESTIMATE; storing both makes the drift
  -- visible per payment instead of silently absorbed.
  --   variance > 0  → we over-collected (student paid more than the fee)
  --   variance < 0  → we under-collected (the platform ate the difference)
  ADD COLUMN IF NOT EXISTS charged_processing_fee_ttd numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_variance_ttd           numeric(10,2);

-- Partial unique index — only enforces uniqueness on populated rows
-- so LuniPay / WiPay payments stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_stripe_payment_intent
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge
  ON payments (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- Surfaces payments where the gross-up estimate missed, so the rate in
-- lib/payments/grossUp.ts can be tuned against real settled data.
CREATE INDEX IF NOT EXISTS idx_payments_fee_variance
  ON payments (fee_variance_ttd)
  WHERE fee_variance_ttd IS NOT NULL;

-- ============================================================
-- STEP 2: Webhook event de-duplication
-- ============================================================
-- Stripe retries failed deliveries (exponential backoff, ~3 days).
-- We persist each event id ONLY after terminal processing, so a
-- transient failure (we return 5xx) can be retried and reprocessed.
-- Shape mirrors lunipay_webhook_events for operator familiarity.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id          text PRIMARY KEY,   -- Stripe event id, e.g. evt_...
  event_type        text NOT NULL,
  livemode          boolean NOT NULL,
  payment_id        uuid REFERENCES payments(id) ON DELETE SET NULL,
  raw_payload       jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'processed'
    CHECK (processing_status IN ('processed', 'failed', 'abandoned', 'skipped')),
  error_message     text,
  -- Retry counter. A row is only treated as a duplicate when
  -- processing_status='processed'; failed rows stay retryable so a
  -- transient error self-heals on Stripe's next delivery. Once
  -- attempts exceeds the cap the handler gives up and marks the row
  -- 'abandoned' so a poison-pill event can't retry for three days.
  attempts          integer NOT NULL DEFAULT 0,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_payment
  ON stripe_webhook_events (payment_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON stripe_webhook_events (received_at DESC);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies defined; only service role (which bypasses RLS) writes.

-- ============================================================
-- STEP 3: Allow 'stripe' as a payout-account provider
-- ============================================================
-- payments.provider has no CHECK constraint (free text, defaulted),
-- so no change is needed there. tutor_payout_accounts is left on
-- its existing default: payouts stay on the manual CSV workflow
-- for this phase, so no Stripe Connect account handles are stored.

-- ============================================================
-- VERIFICATION (commented; run by hand if needed)
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'payments' AND column_name LIKE 'stripe%';
--
-- SELECT to_regclass('public.stripe_webhook_events');
-- Expected: stripe_webhook_events

COMMIT;
