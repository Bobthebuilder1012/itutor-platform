-- ============================================================
-- MIGRATION 249: CASH COMMISSION BECOMES A REAL DEBT
-- ============================================================
-- §8 of the physical-classes spec.
--
-- When a student pays by card, iTutor holds the money and keeps its
-- commission before anything reaches the tutor. When a student hands the
-- tutor cash, the platform never touches the money at all — so the
-- commission on that payment is owed BACK to iTutor, and there is nothing
-- in the system that says so.
--
-- Without this the cash rail is free to use and the card rail is not,
-- which is a standing incentive to move every class off the books. That
-- is not a pricing decision anyone made; it is what happens by default if
-- nobody writes the debt down.
--
-- ── WHY tutor_deductions AND NOT A NEW TABLE ────────────────────────────
-- Migration 170 already models exactly this: an amount a tutor owes the
-- platform, recovered from a future payout batch, with pending/deducted/
-- waived states and a batch reference. The payout pipeline already reads
-- it. A second table would mean two answers to "what does this tutor owe",
-- and the payout batch would only ever see one of them.
--
-- So this migration adds one value to a CHECK list. `reason` is what the
-- wallet renders and what an admin reviews; an unlisted value does not
-- warn, it throws — and the insert that writes it is deliberately
-- non-fatal, so the tutor would be told the cash was recorded while the
-- debt silently failed to exist.
--
-- ── THE RATE IS NOT DECIDED HERE ────────────────────────────────────────
-- getEffectiveCommissionRate() already honours per-tutor and global admin
-- overrides. The amount is computed by that function at record time and
-- stored, so a later rate change does not retroactively alter a debt the
-- tutor has already been shown.
-- ============================================================

ALTER TABLE public.tutor_deductions DROP CONSTRAINT IF EXISTS tutor_deductions_reason_check;

ALTER TABLE public.tutor_deductions
  ADD CONSTRAINT tutor_deductions_reason_check
  CHECK (reason IN (
    'student_removal_refund',
    'admin_manual',
    'chargeback',
    'cash_commission'
  ));

COMMENT ON COLUMN public.tutor_deductions.reason IS
  'Why the tutor owes this. cash_commission = the platform''s share of a payment the student handed the tutor directly, which iTutor never received and therefore could not withhold.';

-- One debt per cash payment. The record-cash action is idempotent by way
-- of refusing an already-PAID row, but a retry that crosses a timeout
-- could still arrive twice, and a duplicated debt is money taken from a
-- tutor twice for one payment. A partial unique index is the only place
-- that can be enforced for certain.
CREATE UNIQUE INDEX IF NOT EXISTS tutor_deductions_one_per_cash_payment
  ON public.tutor_deductions (source_subscription_payment_id)
  WHERE reason = 'cash_commission' AND source_subscription_payment_id IS NOT NULL;
