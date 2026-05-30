-- ============================================================
-- MIGRATION 159: GROUP SUBSCRIPTION BILLING LAYER
-- ============================================================
-- Extends group_enrollments, group_waitlist_entries, group_members
-- with subscription billing state. Adds subscription_payments,
-- group_removals, subscription_refunds, subscription_payment_exceptions.
-- Extends payout_ledger to support subscription payouts.
-- Fixes audit gaps #4, #5, #7, #12 from the groups audit.
-- ============================================================


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 1. EXTEND group_enrollments â€” billing cycle columns
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS plan_price_ttd                 numeric(12,2),
  ADD COLUMN IF NOT EXISTS original_price_ttd             numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent               numeric(5,2),
  ADD COLUMN IF NOT EXISTS discounted_price_ttd           numeric(12,2),
  ADD COLUMN IF NOT EXISTS promotion_id                   uuid,
  ADD COLUMN IF NOT EXISTS promotion_applied_at           timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_duration_days_snapshot int,
  ADD COLUMN IF NOT EXISTS promotion_expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start           timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end             timestamptz,
  ADD COLUMN IF NOT EXISTS next_payment_due_at            timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at           timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_days_snapshot     int,
  ADD COLUMN IF NOT EXISTS last_paid_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS activated_subscription_payment_id uuid,     -- FK added after subscription_payments created
  ADD COLUMN IF NOT EXISTS pending_payment_expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count                 int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at          timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS removal_reason                 text;

-- Extend status CHECK to include subscription lifecycle values.
ALTER TABLE public.group_enrollments
  DROP CONSTRAINT IF EXISTS group_enrollments_status_check;
ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_status_check
  CHECK (status IN (
    'PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'WAITLISTED', 'COMPLETED',
    'GRACE', 'SUSPENDED', 'ACTIVATION_FAILED'
  ));

-- Extend payment_status CHECK.
ALTER TABLE public.group_enrollments
  DROP CONSTRAINT IF EXISTS group_enrollments_payment_status_check;
ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_payment_status_check
  CHECK (payment_status IN (
    'PENDING', 'PAID', 'REFUNDED', 'FREE',
    'PARTIALLY_REFUNDED', 'OVERDUE', 'ACTIVATION_FAILED'
  ));

-- Drop the existing unique index on ACTIVE enrollments;
-- we will replace it with a broader one that also excludes PENDING_PAYMENT and GRACE/SUSPENDED.
DROP INDEX IF EXISTS uq_group_enrollments_student_group_active;
CREATE UNIQUE INDEX uq_group_enrollments_student_group_active_subscription
  ON public.group_enrollments (student_id, group_id)
  WHERE enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED');

-- Performance indexes for cron queries.
CREATE INDEX IF NOT EXISTS idx_ge_next_payment_due
  ON public.group_enrollments (next_payment_due_at)
  WHERE enrollment_type = 'SUBSCRIPTION'
    AND status IN ('ACTIVE', 'GRACE');

CREATE INDEX IF NOT EXISTS idx_ge_pending_payment_expires
  ON public.group_enrollments (pending_payment_expires_at)
  WHERE status = 'PENDING_PAYMENT';

CREATE INDEX IF NOT EXISTS idx_ge_cancel_at_period_end
  ON public.group_enrollments (current_period_end)
  WHERE cancel_at_period_end = true AND status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_ge_subscription_access
  ON public.group_enrollments (group_id, student_id, status)
  WHERE enrollment_type = 'SUBSCRIPTION';


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 2. EXTEND group_members â€” additional statuses
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'invited', 'removed', 'suspended', 'banned'));


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 3. EXTEND group_waitlist_entries â€” offer lifecycle columns
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.group_waitlist_entries
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'expired', 'accepted', 'removed')),
  ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS offered_at    timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_gwl_status_offer_expires
  ON public.group_waitlist_entries (status, offer_expires_at)
  WHERE status = 'offered';


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 4. CREATE subscription_payments
-- Standalone payment table for group subscription charges.
-- Does NOT reference the bookings-centric `payments` table.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id             uuid NOT NULL REFERENCES public.group_enrollments(id) ON DELETE CASCADE,
  group_id                  uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                      text NOT NULL
                            CHECK (type IN ('subscription_initial', 'subscription_renewal', 'subscription_reactivation')),
  amount_ttd                numeric(12,2) NOT NULL CHECK (amount_ttd >= 0),
  original_amount_ttd       numeric(12,2),
  discount_percent          numeric(5,2),
  promotion_id              uuid,
  platform_fee_ttd          numeric(12,2) NOT NULL DEFAULT 0,
  tutor_payout_ttd          numeric(12,2) NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ACTIVATION_FAILED', 'expired')),
  period_start              timestamptz,
  period_end                timestamptz,
  activation_status         text CHECK (activation_status IN ('pending', 'succeeded', 'failed')),
  activation_error          text,
  lunipay_checkout_session_id text,
  lunipay_transaction_id    text,
  receipt_url               text,
  receipt_reference         text,
  checkout_expires_at       timestamptz,
  paid_at                   timestamptz,
  refunded_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_enrollment_period
  ON public.subscription_payments (enrollment_id, period_start)
  WHERE status = 'PAID' AND period_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_lunipay_session
  ON public.subscription_payments (lunipay_checkout_session_id)
  WHERE lunipay_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_enrollment ON public.subscription_payments (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_sp_student ON public.subscription_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_sp_pending_expired
  ON public.subscription_payments (checkout_expires_at)
  WHERE status = 'PENDING';


-- Now add the FK from group_enrollments to subscription_payments.
ALTER TABLE public.group_enrollments
  ADD CONSTRAINT fk_ge_activated_sp
  FOREIGN KEY (activated_subscription_payment_id)
  REFERENCES public.subscription_payments(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 5. EXTEND payout_ledger â€” support subscription payouts
-- session_id made optional; subscription_payment_id added.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.payout_ledger
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.payout_ledger
  ADD COLUMN IF NOT EXISTS subscription_payment_id uuid
    REFERENCES public.subscription_payments(id) ON DELETE SET NULL;

-- Ensure every row has at least one source reference.
ALTER TABLE public.payout_ledger
  DROP CONSTRAINT IF EXISTS payout_ledger_requires_source;
ALTER TABLE public.payout_ledger
  ADD CONSTRAINT payout_ledger_requires_source
  CHECK (session_id IS NOT NULL OR subscription_payment_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_payout_ledger_subscription_payment
  ON public.payout_ledger (subscription_payment_id)
  WHERE subscription_payment_id IS NOT NULL;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 6. EXTEND lunipay_webhook_events â€” subscription tracking
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.lunipay_webhook_events
  ADD COLUMN IF NOT EXISTS subscription_payment_id uuid
    REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'processed'
    CHECK (processing_status IN ('processed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_lwhe_subscription_payment
  ON public.lunipay_webhook_events (subscription_payment_id)
  WHERE subscription_payment_id IS NOT NULL;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 7. CREATE group_removals â€” tutor removal audit log
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS public.group_removals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  enrollment_id       uuid NOT NULL REFERENCES public.group_enrollments(id),
  student_id          uuid NOT NULL REFERENCES public.profiles(id),
  tutor_id            uuid NOT NULL REFERENCES public.profiles(id),
  with_cause          boolean NOT NULL DEFAULT false,
  reason_category     text NOT NULL
                      CHECK (reason_category IN ('no_cause', 'behavioral', 'non_payment', 'other')),
  explanation         text NOT NULL,
  evidence_url        text,
  status              text NOT NULL DEFAULT 'auto_processed'
                      CHECK (status IN ('pending_review', 'approved', 'overturned', 'auto_processed')),
  refund_issued       boolean NOT NULL DEFAULT false,
  refund_amount_ttd   numeric(12,2),
  admin_id            uuid REFERENCES public.profiles(id),
  admin_notes         text,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_removals_group
  ON public.group_removals (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_removals_pending
  ON public.group_removals (status)
  WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS idx_group_removals_student
  ON public.group_removals (student_id);


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 8. CREATE subscription_refunds â€” refund attempt tracking
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS public.subscription_refunds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_payment_id uuid NOT NULL REFERENCES public.subscription_payments(id),
  enrollment_id         uuid NOT NULL REFERENCES public.group_enrollments(id),
  group_removal_id      uuid REFERENCES public.group_removals(id),
  amount_ttd            numeric(12,2) NOT NULL CHECK (amount_ttd >= 0),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed')),
  lunipay_refund_id     text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_refunds_payment
  ON public.subscription_refunds (subscription_payment_id);
CREATE INDEX IF NOT EXISTS idx_subscription_refunds_enrollment
  ON public.subscription_refunds (enrollment_id);


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 9. CREATE subscription_payment_exceptions â€” admin resolution queue
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS public.subscription_payment_exceptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_payment_id uuid REFERENCES public.subscription_payments(id),
  enrollment_id         uuid REFERENCES public.group_enrollments(id),
  group_id              uuid REFERENCES public.groups(id),
  student_id            uuid REFERENCES public.profiles(id),
  exception_type        text NOT NULL
                        CHECK (exception_type IN (
                          'activation_failed', 'metadata_invalid', 'enrollment_missing',
                          'duplicate_payment', 'capacity_conflict', 'refund_required'
                        )),
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_review', 'resolved', 'refunded', 'duplicate')),
  error_message         text,
  admin_id              uuid REFERENCES public.profiles(id),
  admin_action          text,
  admin_notes           text,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spe_open
  ON public.subscription_payment_exceptions (status, created_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_spe_enrollment
  ON public.subscription_payment_exceptions (enrollment_id);


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10. RLS POLICIES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_exceptions ENABLE ROW LEVEL SECURITY;

-- subscription_payments
CREATE POLICY "student_read_own_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "tutor_read_group_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = subscription_payments.group_id AND g.tutor_id = auth.uid()
    )
  );

CREATE POLICY "admin_read_all_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- group_removals
CREATE POLICY "tutor_read_own_removals"
  ON public.group_removals FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY "student_read_own_removal"
  ON public.group_removals FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "admin_read_all_removals"
  ON public.group_removals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- subscription_refunds
CREATE POLICY "student_read_own_refunds"
  ON public.subscription_refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscription_payments sp
      WHERE sp.id = subscription_refunds.subscription_payment_id AND sp.student_id = auth.uid()
    )
  );

CREATE POLICY "admin_read_all_refunds"
  ON public.subscription_refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- subscription_payment_exceptions
CREATE POLICY "admin_read_all_exceptions"
  ON public.subscription_payment_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role full access for all new tables
GRANT ALL ON public.subscription_payments TO service_role;
GRANT ALL ON public.group_removals TO service_role;
GRANT ALL ON public.subscription_refunds TO service_role;
GRANT ALL ON public.subscription_payment_exceptions TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 11. RPC: activate_subscription
-- Called by webhook/finalize on successful payment.
-- Atomically updates enrollment, creates subscription_payments row,
-- creates payout_ledger row, updates tutor_balances.
-- Idempotent on activated_subscription_payment_id.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.activate_subscription(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sp_id        uuid := (p_payload->>'subscription_payment_id')::uuid;
  v_period_start timestamptz := (p_payload->>'period_start')::timestamptz;
  v_period_end   timestamptz := (p_payload->>'period_end')::timestamptz;
  v_amount       numeric := (p_payload->>'amount_ttd')::numeric;
  v_platform_fee numeric := (p_payload->>'platform_fee_ttd')::numeric;
  v_payout       numeric := (p_payload->>'tutor_payout_ttd')::numeric;
  v_grace_days   int;
  v_sp           record;
  v_enrollment   record;
BEGIN
  -- Lock the subscription_payment row
  SELECT sp.*, g.grace_period_days, g.tutor_id
  INTO v_sp
  FROM public.subscription_payments sp
  JOIN public.group_enrollments ge ON ge.id = sp.enrollment_id
  JOIN public.groups g ON g.id = ge.group_id
  WHERE sp.id = v_sp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscription_payment_not_found');
  END IF;

  -- Idempotency: already activated
  IF v_sp.status = 'PAID' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'enrollment_id', v_sp.enrollment_id);
  END IF;

  v_grace_days := COALESCE(v_sp.grace_period_days, 7);

  -- Mark payment as PAID
  UPDATE public.subscription_payments SET
    status            = 'PAID',
    amount_ttd        = COALESCE(v_amount, amount_ttd),
    platform_fee_ttd  = COALESCE(v_platform_fee, platform_fee_ttd),
    tutor_payout_ttd  = COALESCE(v_payout, tutor_payout_ttd),
    period_start      = v_period_start,
    period_end        = v_period_end,
    activation_status = 'succeeded',
    paid_at           = now()
  WHERE id = v_sp_id;

  -- Activate enrollment
  UPDATE public.group_enrollments SET
    status                        = 'ACTIVE',
    payment_status                = 'PAID',
    current_period_start          = v_period_start,
    current_period_end            = v_period_end,
    next_payment_due_at           = v_period_end,
    grace_period_ends_at          = v_period_end + (v_grace_days * INTERVAL '1 day'),
    grace_period_days_snapshot    = v_grace_days,
    last_paid_at                  = now(),
    activated_subscription_payment_id = v_sp_id,
    pending_payment_expires_at    = NULL,
    reminder_count                = 0,
    last_reminder_sent_at         = NULL,
    expires_at                    = v_period_end
  WHERE id = v_sp.enrollment_id;

  -- Create payout_ledger row if payout > 0
  IF COALESCE(v_payout, 0) > 0 THEN
    INSERT INTO public.payout_ledger (
      subscription_payment_id, tutor_id, amount_ttd, status
    ) VALUES (
      v_sp_id, v_sp.tutor_id, v_payout, 'owed'
    )
    ON CONFLICT DO NOTHING;

    -- Update tutor_balances
    INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd)
    VALUES (v_sp.tutor_id, v_payout, 0)
    ON CONFLICT (tutor_id) DO UPDATE
    SET pending_ttd = public.tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
        last_updated = now();
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'enrollment_id', v_sp.enrollment_id,
    'status',       'ACTIVE',
    'period_start', v_period_start,
    'period_end',   v_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_subscription(jsonb) TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 12. RPC: check_subscription_access
-- Returns access state for the group session page.
-- Access requires PAID + valid period.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.check_subscription_access(
  p_student_id uuid,
  p_group_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e record;
BEGIN
  SELECT id, status, payment_status,
         current_period_start, current_period_end,
         next_payment_due_at, grace_period_ends_at,
         plan_price_ttd, cancel_at_period_end,
         pending_payment_expires_at
  INTO v_e
  FROM public.group_enrollments
  WHERE student_id      = p_student_id
    AND group_id        = p_group_id
    AND enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('subscribed', false, 'has_access', false, 'status', 'none');
  END IF;

  RETURN jsonb_build_object(
    'subscribed',               true,
    'enrollment_id',            v_e.id,
    'status',                   v_e.status,
    'payment_status',           v_e.payment_status,
    'has_access',               (
      v_e.payment_status = 'PAID'
      AND v_e.current_period_start IS NOT NULL
      AND v_e.current_period_end IS NOT NULL
      AND v_e.current_period_end > now()
      AND v_e.status IN ('ACTIVE', 'GRACE')
    ),
    'current_period_start',     v_e.current_period_start,
    'current_period_end',       v_e.current_period_end,
    'next_payment_due_at',      v_e.next_payment_due_at,
    'grace_period_ends_at',     v_e.grace_period_ends_at,
    'plan_price_ttd',           v_e.plan_price_ttd,
    'cancel_at_period_end',     v_e.cancel_at_period_end,
    'pending_payment_expires_at', v_e.pending_payment_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_subscription_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_access(uuid, uuid) TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 13. RPC: process_subscription_removal
-- Cancels enrollment, updates group_members, marks removal resolved.
-- Called after a successful refund for no-cause removals,
-- or by admin for with-cause overturns.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.process_subscription_removal(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment_id uuid := (p_payload->>'enrollment_id')::uuid;
  v_removal_id    uuid := (p_payload->>'removal_id')::uuid;
  v_refund_amount numeric := (p_payload->>'refund_amount_ttd')::numeric;
  v_e             record;
BEGIN
  SELECT ge.*, g.tutor_id
  INTO v_e
  FROM public.group_enrollments ge
  JOIN public.groups g ON g.id = ge.group_id
  WHERE ge.id = v_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enrollment_not_found');
  END IF;

  -- Cancel enrollment
  UPDATE public.group_enrollments SET
    status         = 'CANCELLED',
    payment_status = CASE WHEN COALESCE(v_refund_amount, 0) > 0
                          THEN 'PARTIALLY_REFUNDED'
                          ELSE payment_status END,
    cancelled_at   = now()
  WHERE id = v_enrollment_id;

  -- Update group_members to removed
  UPDATE public.group_members SET status = 'removed'
  WHERE group_id = v_e.group_id
    AND user_id  = v_e.student_id
    AND status NOT IN ('removed', 'banned');

  -- Mark removal resolved
  IF v_removal_id IS NOT NULL THEN
    UPDATE public.group_removals SET
      refund_issued     = COALESCE(v_refund_amount, 0) > 0,
      refund_amount_ttd = v_refund_amount,
      resolved_at       = now()
    WHERE id = v_removal_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'enrollment_id', v_enrollment_id,
    'status',        'CANCELLED',
    'refund_issued', COALESCE(v_refund_amount, 0) > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_subscription_removal(jsonb) TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 14. RPC: process_waitlist_offer
-- Transactionally promotes the next waiting student to offered.
-- Caller sends notifications after this returns.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.process_waitlist_offer(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity    int;
  v_used        int;
  v_entry       record;
BEGIN
  -- Check capacity
  SELECT max_students INTO v_capacity FROM public.groups WHERE id = p_group_id;

  SELECT COUNT(*) INTO v_used
  FROM public.group_enrollments
  WHERE group_id        = p_group_id
    AND enrollment_type = 'SUBSCRIPTION'
    AND (
      (status IN ('ACTIVE', 'GRACE', 'SUSPENDED'))
      OR (status = 'PENDING_PAYMENT' AND pending_payment_expires_at > now())
    );

  IF COALESCE(v_capacity, 20) <= v_used THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_capacity');
  END IF;

  -- Check no active offer already outstanding
  IF EXISTS (
    SELECT 1 FROM public.group_waitlist_entries
    WHERE group_id = p_group_id AND status = 'offered' AND offer_expires_at > now()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offer_already_active');
  END IF;

  -- Lock and select first waiting entry
  SELECT * INTO v_entry
  FROM public.group_waitlist_entries
  WHERE group_id = p_group_id AND status = 'waiting'
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_waiting_students');
  END IF;

  -- Mark as offered
  UPDATE public.group_waitlist_entries SET
    status          = 'offered',
    offered_at      = now(),
    offer_expires_at = now() + INTERVAL '48 hours'
  WHERE id = v_entry.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'waitlist_entry_id', v_entry.id,
    'student_id',      v_entry.student_id,
    'offer_expires_at', now() + INTERVAL '48 hours'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_waitlist_offer(uuid) TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 15. RPC: expire_waitlist_offers
-- Marks expired offered entries and returns groups needing re-promotion.
-- Called by cron.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.expire_waitlist_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_groups uuid[];
BEGIN
  WITH expired AS (
    UPDATE public.group_waitlist_entries
    SET status     = 'expired',
        expired_at = now()
    WHERE status = 'offered' AND offer_expires_at < now()
    RETURNING group_id, student_id
  )
  SELECT array_agg(DISTINCT group_id) INTO v_affected_groups FROM expired;

  RETURN jsonb_build_object(
    'ok',              true,
    'affected_groups', COALESCE(v_affected_groups, '{}')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_waitlist_offers() TO service_role;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 16. VERIFY migration
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DO $$
BEGIN
  -- New columns on group_enrollments
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'group_enrollments'
      AND column_name IN (
        'plan_price_ttd', 'current_period_start', 'current_period_end',
        'next_payment_due_at', 'cancel_at_period_end', 'reminder_count',
        'pending_payment_expires_at', 'grace_period_days_snapshot'
      )
  ) = 8, 'group_enrollments billing columns missing';

  -- New tables
  ASSERT to_regclass('public.subscription_payments') IS NOT NULL,
    'subscription_payments table missing';
  ASSERT to_regclass('public.group_removals') IS NOT NULL,
    'group_removals table missing';
  ASSERT to_regclass('public.subscription_refunds') IS NOT NULL,
    'subscription_refunds table missing';
  ASSERT to_regclass('public.subscription_payment_exceptions') IS NOT NULL,
    'subscription_payment_exceptions table missing';

  -- RPCs
  ASSERT (
    SELECT COUNT(*) FROM pg_proc
    WHERE proname IN (
      'activate_subscription', 'check_subscription_access',
      'process_subscription_removal', 'process_waitlist_offer',
      'expire_waitlist_offers'
    )
  ) = 5, 'One or more RPCs missing';

  RAISE NOTICE 'Migration 159 verified successfully.';
END $$;

