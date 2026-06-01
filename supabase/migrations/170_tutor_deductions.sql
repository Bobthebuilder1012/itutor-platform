-- ============================================================
-- MIGRATION 170: TUTOR DEDUCTIONS
-- ============================================================
-- Tracks platform-balance refunds that must be recovered from a
-- tutor after their payout has already been released.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tutor_deductions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id                 uuid NOT NULL REFERENCES public.profiles(id),
  amount_ttd               numeric(12,2) NOT NULL CHECK (amount_ttd > 0),
  reason                   text NOT NULL CHECK (reason IN (
    'student_removal_refund',
    'admin_manual',
    'chargeback'
  )),
  source_enrollment_id     uuid REFERENCES public.group_enrollments(id),
  source_payment_id        uuid REFERENCES public.payments(id),
  -- Subscription payments are standalone and do not reference payments(id).
  -- Keep source_payment_id for the requested session-payment source, and
  -- track subscription-origin deductions here.
  source_subscription_payment_id uuid REFERENCES public.subscription_payments(id),
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'deducted', 'waived')),
  deducted_from_batch_id   uuid REFERENCES public.payout_batches(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz
);

ALTER TABLE public.tutor_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_tutor_deductions"
  ON public.tutor_deductions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "tutors_read_own_deductions"
  ON public.tutor_deductions FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

GRANT ALL ON public.tutor_deductions TO service_role;

CREATE INDEX IF NOT EXISTS tutor_deductions_tutor_status_idx
  ON public.tutor_deductions (tutor_id, status, created_at);

CREATE INDEX IF NOT EXISTS tutor_deductions_batch_idx
  ON public.tutor_deductions (deducted_from_batch_id)
  WHERE deducted_from_batch_id IS NOT NULL;


-- ============================================================
-- GROUP REMOVAL POLICY CLEANUP
-- ============================================================
-- The product no longer supports cause-based removals or admin
-- review for removals. Preserve historical rows, but normalize
-- any open review rows to the single auto-processed flow and
-- prevent new with_cause=true writes.

UPDATE public.group_removals
SET
  with_cause = false,
  reason_category = 'no_cause',
  status = CASE WHEN status = 'pending_review' THEN 'auto_processed' ELSE status END
WHERE with_cause = true
   OR reason_category <> 'no_cause'
   OR status = 'pending_review';

ALTER TABLE public.group_removals
  ALTER COLUMN with_cause SET DEFAULT false;

DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.group_removals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%with_cause%'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.group_removals DROP CONSTRAINT %I', v_con);
  END IF;
END;
$$;

ALTER TABLE public.group_removals
  ADD CONSTRAINT group_removals_with_cause_false_check
  CHECK (with_cause = false);

DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.group_removals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%reason_category%'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.group_removals DROP CONSTRAINT %I', v_con);
  END IF;
END;
$$;

ALTER TABLE public.group_removals
  ADD CONSTRAINT group_removals_reason_category_check
  CHECK (reason_category = 'no_cause');

DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.group_removals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pending_review%'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.group_removals DROP CONSTRAINT %I', v_con);
  END IF;
END;
$$;

ALTER TABLE public.group_removals
  ADD CONSTRAINT group_removals_status_check
  CHECK (status IN ('auto_processed', 'approved', 'overturned'));
