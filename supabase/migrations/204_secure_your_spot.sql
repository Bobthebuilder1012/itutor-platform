-- ============================================================
-- MIGRATION 204: SECURE YOUR SPOT (paid preorder for group classes)
-- iTutor Database
-- ============================================================
--
-- A student pays the first month up front to hold a seat in a class
-- that has not started yet. The money is held by the platform until
-- that first month has actually been delivered.
--
-- HOLDING IS NOT A NEW LEDGER STATUS. payout_ledger already models
-- this: rows sit at 'owed' (counted in tutor_balances.pending_ttd),
-- flip_owed_to_release_ready promotes them to 'release_ready', and
-- the CSV export (app/api/admin/payouts/export) selects ONLY
-- 'release_ready'. So "held" == "still 'owed'", and the escrow is
-- enforced by not flipping it yet. Migration 205 teaches the flip
-- about release_date. Do NOT add 'held'/'releasable' statuses: the
-- payout RPCs match those strings exactly and would silently skip
-- any row wearing a name they don't know.
--
-- LEDGER SOURCE. payout_ledger has
--   CHECK (session_id IS NOT NULL OR subscription_payment_id IS NOT NULL)
-- and a secured spot has neither a session nor a subscription. We
-- therefore synthesise a subscription_payments row for the secured
-- month, which also gets the charge into the money reports that
-- already read that table (admin lesson-payments, payment stats,
-- payout cases, refunds) instead of inventing a parallel surface.
-- That needs a new `type`, added below.
--
-- START DATE. There is deliberately no groups.start_date. The class
-- start comes from the schedule (group_sessions), per product
-- decision. Note for the API layer: group_sessions.starts_on is set
-- to the CREATION date for recurring classes, so it is NOT the first
-- lesson — the first lesson must be projected from the recurrence or
-- read from the earliest future occurrence.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CLASS FLAG
-- ============================================================
-- Only meaningful when the class has a schedule and a future start.
-- Enforced in the API (a CHECK cannot see group_sessions); the UI
-- keeps the toggle disabled until a schedule exists.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS secure_spot_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.groups.secure_spot_enabled IS
  'Tutor has opened paid preorders for this class. Only settable while the '
  'class has a confirmed schedule and a first session in the future.';

-- ============================================================
-- 2. ENROLMENT COLUMNS
-- ============================================================

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS secured_at               timestamptz,
  ADD COLUMN IF NOT EXISTS secure_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS release_date             date;

COMMENT ON COLUMN public.group_enrollments.release_date IS
  'When the held first month becomes payable to the tutor. Computed ONCE at '
  'payment success and stored — never derived from groups.end_date at read '
  'time, or a tutor who keeps extending the class would never be paid. Has a '
  'floor: never earlier than one calendar month after the first session.';

-- ============================================================
-- 3. ENROLMENT STATUS CONSTRAINT
-- ============================================================
-- Every existing value is re-listed. Migration 203 dropped six
-- notification types by rewriting a constraint from memory and broke
-- live inserts; this list was read back off production, not recalled.
--
--   SECURED_PENDING_PAYMENT — checkout open, does NOT hold a seat
--   SECURED                 — paid, holds a seat, has class access
--
-- NOT VALID: historical rows are not re-checked. They already satisfy
-- it, but validating locks the table and buys nothing.

ALTER TABLE public.group_enrollments
  DROP CONSTRAINT IF EXISTS group_enrollments_status_check;

ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_status_check
  CHECK (status IN (
    'PENDING_PAYMENT',
    'ACTIVE',
    'CANCELLED',
    'WAITLISTED',
    'COMPLETED',
    'GRACE',
    'SUSPENDED',
    'ACTIVATION_FAILED',
    'SECURED_PENDING_PAYMENT',
    'SECURED'
  )) NOT VALID;

-- Drives the daily release cron. Partial, so it only ever indexes
-- money that is currently being held.
CREATE INDEX IF NOT EXISTS idx_ge_release_date_secured
  ON public.group_enrollments (release_date)
  WHERE status = 'SECURED';

-- One enrolment per PaymentIntent. The webhook is the only writer of
-- payment state and Stripe retries deliveries, so the second delivery
-- of the same event must not create a second secured seat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ge_secure_payment_intent
  ON public.group_enrollments (secure_payment_intent_id)
  WHERE secure_payment_intent_id IS NOT NULL;

-- ============================================================
-- 4. SUBSCRIPTION PAYMENT TYPE
-- ============================================================
-- The synthesised row for the secured month. Listed with the three
-- existing types, not replacing them.

ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_type_check;

ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_type_check
  CHECK (type IN (
    'subscription_initial',
    'subscription_renewal',
    'subscription_reactivation',
    'secure_spot'
  ));

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.group_enrollments'::regclass AND contype = 'c';
--
-- Expect 10 status values, and secure_spot in the payment types.
