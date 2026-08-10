-- ============================================================
-- MIGRATION 201: STRIPE REFS ON subscription_payments
-- iTutor Database
-- ============================================================
--
-- Group subscriptions move from LuniPay hosted checkout to Stripe.
-- subscription_payments only had lunipay_checkout_session_id /
-- lunipay_transaction_id; Stripe ids get their own columns rather than
-- being stuffed into LuniPay-named ones, so provider is always legible
-- from the row and reconciliation against either dashboard stays honest.
--
-- Both providers coexist: existing LuniPay subscription payments keep
-- their columns and keep working.
--
-- We still own the recurring cycle (group_enrollments
-- next_payment_due_at + the process-subscriptions cron). Stripe is only
-- charging each cycle, so there is no Stripe Subscription object here —
-- just a PaymentIntent per cycle, exactly like the 1:1 flow.
-- ============================================================

BEGIN;

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id         text,
  -- What we added on top of the tutor's price to cover the processing
  -- fee, mirroring payments.charged_processing_fee_ttd so subscription
  -- and one-off payments reconcile the same way.
  ADD COLUMN IF NOT EXISTS charged_processing_fee_ttd numeric(10,2);

-- Partial unique index: one subscription_payment per PaymentIntent.
-- Partial so the existing LuniPay rows (NULL here) stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_stripe_intent
  ON public.subscription_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_stripe_charge
  ON public.subscription_payments (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name='subscription_payments' AND column_name LIKE 'stripe%';
