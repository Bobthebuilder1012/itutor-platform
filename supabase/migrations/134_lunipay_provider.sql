-- ============================================================
-- MIGRATION 134: LUNIPAY PROVIDER
-- iTutor Database
-- ============================================================
--
-- Switches the payment provider from WiPay to LuniPay
-- (Stripe-powered Caribbean payment platform).
--
-- Purely additive:
--   * adds `lunipay_*` provider handles to `payments`
--   * adds provider-agnostic lifecycle columns
--     (paid_at, released_at, cancelled_at, expires_at, cancel_reason)
--   * adds the `lunipay_webhook_events` de-dup table
--   * flips the `provider` defaults to 'lunipay'
--
-- Reuses the existing payments / payout_ledger / tutor_earnings /
-- tutor_balances tables and the auto-credit trigger from
-- migration 129.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Add LuniPay-specific columns to `payments`
-- ============================================================

ALTER TABLE payments
  -- LuniPay-specific provider handles
  ADD COLUMN IF NOT EXISTS lunipay_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS lunipay_payment_id          text,
  ADD COLUMN IF NOT EXISTS lunipay_payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS lunipay_checkout_url        text,
  -- Cross-cutting lifecycle columns used by initiate / webhook /
  -- status / cancel / release routes. Provider-agnostic so any
  -- future gateway can reuse them.
  ADD COLUMN IF NOT EXISTS paid_at                     timestamptz,
  ADD COLUMN IF NOT EXISTS released_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at                timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason               text;

-- Partial unique index — only enforces uniqueness on populated rows
-- so legacy payments (provider != 'lunipay') stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_lunipay_session_id
  ON payments (lunipay_checkout_session_id)
  WHERE lunipay_checkout_session_id IS NOT NULL;

-- Lookup index for the underlying Stripe payment intent (useful
-- when reconciling against Stripe dashboard exports).
CREATE INDEX IF NOT EXISTS idx_payments_lunipay_payment_intent
  ON payments (lunipay_payment_intent_id)
  WHERE lunipay_payment_intent_id IS NOT NULL;

-- Lifecycle indexes used by reporting and the release-cron lookups.
CREATE INDEX IF NOT EXISTS idx_payments_paid_at
  ON payments (paid_at)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_released_at
  ON payments (released_at)
  WHERE released_at IS NOT NULL;

-- ============================================================
-- STEP 2: Webhook event de-duplication
-- ============================================================
-- LuniPay retries failed webhook deliveries with an identical
-- body. We persist each successfully-processed event id so the
-- webhook handler can short-circuit duplicates.

CREATE TABLE IF NOT EXISTS lunipay_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  livemode     boolean NOT NULL,
  payment_id   uuid REFERENCES payments(id) ON DELETE SET NULL,
  raw_payload  jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lunipay_webhook_events_payment
  ON lunipay_webhook_events (payment_id);

CREATE INDEX IF NOT EXISTS idx_lunipay_webhook_events_received_at
  ON lunipay_webhook_events (received_at DESC);

ALTER TABLE lunipay_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies defined; only service role (which bypasses RLS) writes.

-- ============================================================
-- STEP 3: Flip provider defaults from 'paywise' to 'lunipay'
-- ============================================================
-- Only changes DEFAULT for new rows. Existing rows keep their
-- stored provider value, which is what we want for any historical
-- WiPay / PayWise payments still in flight.

ALTER TABLE payments
  ALTER COLUMN provider SET DEFAULT 'lunipay';

DO $$
BEGIN
  IF to_regclass('public.tutor_payout_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE tutor_payout_accounts ALTER COLUMN provider SET DEFAULT ''lunipay''';
  END IF;
END $$;

-- ============================================================
-- VERIFICATION (commented; run by hand if needed)
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'payments' AND column_name LIKE 'lunipay%';
--
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'payments' AND column_name = 'provider';
-- Expected: 'lunipay'::text

COMMIT;
