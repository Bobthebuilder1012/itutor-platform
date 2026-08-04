-- ============================================================
-- MIGRATION 202: NATIVE STRIPE SUBSCRIPTIONS FOR GROUP CLASSES
-- iTutor Database
-- ============================================================
--
-- Group classes move to real Stripe Subscriptions: Stripe owns the
-- billing cycle, charges automatically each period, and runs its own
-- retry/dunning schedule.
--
-- This REVERSES the earlier "we keep owning the cycle" design. The
-- reason is that nothing ever auto-charged: /subscribe took a single
-- PaymentIntent with no saved card, and process-subscriptions only
-- reminded, grace-d and suspended. A "monthly subscription" was one
-- payment plus a monthly nag, on both LuniPay and Stripe.
--
-- !! THE CRITICAL SAFETY PROPERTY !!
--   Once Stripe owns a subscription's cycle, our own dunning must NOT
--   also run against it, or a student gets suspended by us while Stripe
--   is still happily retrying — and double reminder emails besides.
--   group_enrollments.billing_provider is the switch: the
--   process-subscriptions cron skips anything marked 'stripe'.
--   Existing LuniPay enrollments keep 'lunipay' and are untouched.
-- ============================================================

BEGIN;

-- ---------- Customer per student ----------
-- Subscriptions require a Customer. Direct-pay creates guest
-- PaymentIntents with no Customer attached, so this is genuinely new.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_stripe_customer
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------- Recurring Price per group ----------
-- A Stripe Price is immutable. When a tutor changes the class price we
-- create a NEW Price and repoint this column; existing subscribers stay
-- attached to the old Price until explicitly migrated, which is why the
-- pointer is stored rather than the amount.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  -- The amount stripe_price_id was created for, so we can detect that a
  -- tutor edited price_monthly and the Price needs regenerating.
  ADD COLUMN IF NOT EXISTS stripe_price_amount_ttd numeric(10,2);

-- ---------- Subscription per enrollment ----------
ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  -- Which system owns this enrollment's billing cycle. 'lunipay' keeps
  -- the legacy self-managed behaviour; 'stripe' means hands off.
  ADD COLUMN IF NOT EXISTS billing_provider text NOT NULL DEFAULT 'lunipay';

ALTER TABLE public.group_enrollments
  DROP CONSTRAINT IF EXISTS group_enrollments_billing_provider_check;

ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_billing_provider_check
  CHECK (billing_provider IN ('lunipay', 'stripe'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_enrollments_stripe_subscription
  ON public.group_enrollments (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- The cron's hot path: "enrollments I still own the billing for".
CREATE INDEX IF NOT EXISTS idx_group_enrollments_self_billed
  ON public.group_enrollments (next_payment_due_at)
  WHERE billing_provider <> 'stripe';

-- ---------- Invoice refs on subscription_payments ----------
-- With native subscriptions each cycle is an INVOICE, not a bare
-- PaymentIntent. invoice.paid is the source of truth that money moved.
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS stripe_invoice_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_stripe_invoice
  ON public.subscription_payments (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT billing_provider, count(*) FROM group_enrollments GROUP BY 1;
-- Expected right after this migration: every row 'lunipay'.
