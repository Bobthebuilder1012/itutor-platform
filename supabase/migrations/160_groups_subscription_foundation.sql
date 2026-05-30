-- ============================================================
-- MIGRATION 160: GROUPS SUBSCRIPTION FOUNDATION
-- ============================================================
-- Catches up unapplied changes from migrations 094, 095, and
-- applies the subscription billing layer from migration 159.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so this is safe to run on any DB state.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. EXTEND groups — price + subscription columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS difficulty       text CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  ADD COLUMN IF NOT EXISTS goals            text,
  ADD COLUMN IF NOT EXISTS price_per_session numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_monthly    numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_model    text NOT NULL DEFAULT 'FREE'
    CHECK (pricing_model IN ('PER_SESSION', 'MONTHLY', 'FREE')),
  ADD COLUMN IF NOT EXISTS recurrence_type  text NOT NULL DEFAULT 'NONE'
    CHECK (recurrence_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY')),
  ADD COLUMN IF NOT EXISTS recurrence_rule  text,
  ADD COLUMN IF NOT EXISTS timezone         text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS max_students     integer NOT NULL DEFAULT 20 CHECK (max_students > 0),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

-- columns from 095
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS form_level             text,
  ADD COLUMN IF NOT EXISTS topic                  text,
  ADD COLUMN IF NOT EXISTS session_length_minutes integer,
  ADD COLUMN IF NOT EXISTS session_frequency      text,
  ADD COLUMN IF NOT EXISTS price_per_course       numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_mode           text,
  ADD COLUMN IF NOT EXISTS availability_window    text,
  ADD COLUMN IF NOT EXISTS media_gallery          jsonb DEFAULT '[]'::jsonb;

-- columns from audit migrations 128–129
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS visibility                 text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private')),
  ADD COLUMN IF NOT EXISTS require_join_requests      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_suspend_missed_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_period_days          integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS google_classroom_link      text,
  ADD COLUMN IF NOT EXISTS primary_channel            text,
  ADD COLUMN IF NOT EXISTS parent_feedback_price      numeric(10,2),
  ADD COLUMN IF NOT EXISTS member_service_fee         numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_groups_status         ON public.groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_subject        ON public.groups(subject);
CREATE INDEX IF NOT EXISTS idx_groups_tutor_status   ON public.groups(tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_groups_form_level     ON public.groups(form_level);
CREATE INDEX IF NOT EXISTS idx_groups_visibility     ON public.groups(visibility) WHERE archived_at IS NULL;


-- ─────────────────────────────────────────────────────────────
-- 2. CREATE group_enrollments (base schema from 094)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  session_id      uuid,
  enrollment_type text NOT NULL CHECK (enrollment_type IN ('SUBSCRIPTION', 'SINGLE_SESSION')),
  status          text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN (
      'PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'WAITLISTED', 'COMPLETED',
      'GRACE', 'SUSPENDED', 'ACTIVATION_FAILED'
    )),
  payment_status  text NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN (
      'PENDING', 'PAID', 'REFUNDED', 'FREE',
      'PARTIALLY_REFUNDED', 'OVERDUE', 'ACTIVATION_FAILED'
    )),
  payment_ref     text,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- subscription billing columns (from migration 159)
  plan_price_ttd                  numeric(12,2),
  original_price_ttd              numeric(12,2),
  discount_percent                numeric(5,2),
  discounted_price_ttd            numeric(12,2),
  promotion_id                    uuid,
  promotion_applied_at            timestamptz,
  promotion_duration_days_snapshot int,
  promotion_expires_at            timestamptz,
  current_period_start            timestamptz,
  current_period_end              timestamptz,
  next_payment_due_at             timestamptz,
  grace_period_ends_at            timestamptz,
  grace_period_days_snapshot      int,
  last_paid_at                    timestamptz,
  activated_subscription_payment_id uuid,
  pending_payment_expires_at      timestamptz,
  reminder_count                  int NOT NULL DEFAULT 0,
  last_reminder_sent_at           timestamptz,
  cancel_at_period_end            boolean NOT NULL DEFAULT false,
  cancelled_at                    timestamptz,
  removal_reason                  text
);

CREATE INDEX IF NOT EXISTS idx_group_enrollments_student        ON public.group_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_group          ON public.group_enrollments(group_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_status         ON public.group_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_group_status   ON public.group_enrollments(group_id, status);
CREATE INDEX IF NOT EXISTS idx_ge_next_payment_due              ON public.group_enrollments(next_payment_due_at)
  WHERE enrollment_type = 'SUBSCRIPTION' AND status IN ('ACTIVE', 'GRACE');
CREATE INDEX IF NOT EXISTS idx_ge_pending_payment_expires       ON public.group_enrollments(pending_payment_expires_at)
  WHERE status = 'PENDING_PAYMENT';
CREATE INDEX IF NOT EXISTS idx_ge_cancel_at_period_end          ON public.group_enrollments(current_period_end)
  WHERE cancel_at_period_end = true AND status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_ge_subscription_access           ON public.group_enrollments(group_id, student_id, status)
  WHERE enrollment_type = 'SUBSCRIPTION';

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_enrollments_student_group_active_subscription
  ON public.group_enrollments (student_id, group_id)
  WHERE enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED');

-- RLS on group_enrollments
ALTER TABLE public.group_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "student_read_own_enrollments"
  ON public.group_enrollments FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY IF NOT EXISTS "tutor_read_group_enrollments"
  ON public.group_enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_enrollments.group_id AND g.tutor_id = auth.uid()
    )
  );

GRANT ALL ON public.group_enrollments TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 3. CREATE group_waitlist_entries (base + lifecycle columns)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_waitlist_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  position        integer NOT NULL CHECK (position > 0),
  status          text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'expired', 'accepted', 'removed')),
  offer_expires_at timestamptz,
  offered_at      timestamptz,
  accepted_at     timestamptz,
  expired_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_waitlist_student UNIQUE (student_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_waitlist_group_position ON public.group_waitlist_entries(group_id, position);
CREATE INDEX IF NOT EXISTS idx_gwl_status_offer_expires      ON public.group_waitlist_entries(status, offer_expires_at)
  WHERE status = 'offered';

GRANT ALL ON public.group_waitlist_entries TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 4. CREATE subscription_payments
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id               uuid NOT NULL REFERENCES public.group_enrollments(id) ON DELETE CASCADE,
  group_id                    uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                        text NOT NULL
    CHECK (type IN ('subscription_initial', 'subscription_renewal', 'subscription_reactivation')),
  amount_ttd                  numeric(12,2) NOT NULL CHECK (amount_ttd >= 0),
  original_amount_ttd         numeric(12,2),
  discount_percent            numeric(5,2),
  promotion_id                uuid,
  platform_fee_ttd            numeric(12,2) NOT NULL DEFAULT 0,
  tutor_payout_ttd            numeric(12,2) NOT NULL DEFAULT 0,
  status                      text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ACTIVATION_FAILED', 'expired')),
  period_start                timestamptz,
  period_end                  timestamptz,
  activation_status           text CHECK (activation_status IN ('pending', 'succeeded', 'failed')),
  activation_error            text,
  lunipay_checkout_session_id text,
  lunipay_transaction_id      text,
  receipt_url                 text,
  receipt_reference           text,
  checkout_expires_at         timestamptz,
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_enrollment_period
  ON public.subscription_payments (enrollment_id, period_start)
  WHERE status = 'PAID' AND period_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_lunipay_session
  ON public.subscription_payments (lunipay_checkout_session_id)
  WHERE lunipay_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_enrollment          ON public.subscription_payments (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_sp_student             ON public.subscription_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_sp_pending_expired     ON public.subscription_payments (checkout_expires_at)
  WHERE status = 'PENDING';

-- FK from group_enrollments to subscription_payments
ALTER TABLE public.group_enrollments
  ADD CONSTRAINT IF NOT EXISTS fk_ge_activated_sp
  FOREIGN KEY (activated_subscription_payment_id)
  REFERENCES public.subscription_payments(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "student_read_own_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY IF NOT EXISTS "tutor_read_group_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = subscription_payments.group_id AND g.tutor_id = auth.uid()
    )
  );

GRANT ALL ON public.subscription_payments TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 5. EXTEND payout_ledger — subscription payout support
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.payout_ledger
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.payout_ledger
  ADD COLUMN IF NOT EXISTS subscription_payment_id uuid
    REFERENCES public.subscription_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payout_ledger_subscription_payment
  ON public.payout_ledger (subscription_payment_id)
  WHERE subscription_payment_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 6. EXTEND lunipay_webhook_events
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.lunipay_webhook_events
  ADD COLUMN IF NOT EXISTS subscription_payment_id uuid
    REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'processed'
    CHECK (processing_status IN ('processed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;


-- ─────────────────────────────────────────────────────────────
-- 7. CREATE group_removals
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_removals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  enrollment_id     uuid NOT NULL REFERENCES public.group_enrollments(id),
  student_id        uuid NOT NULL REFERENCES public.profiles(id),
  tutor_id          uuid NOT NULL REFERENCES public.profiles(id),
  with_cause        boolean NOT NULL DEFAULT false,
  reason_category   text NOT NULL
    CHECK (reason_category IN ('no_cause', 'behavioral', 'non_payment', 'other')),
  explanation       text NOT NULL,
  evidence_url      text,
  status            text NOT NULL DEFAULT 'auto_processed'
    CHECK (status IN ('pending_review', 'approved', 'overturned', 'auto_processed')),
  refund_issued     boolean NOT NULL DEFAULT false,
  refund_amount_ttd numeric(12,2),
  admin_id          uuid REFERENCES public.profiles(id),
  admin_notes       text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_removals ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.group_removals TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 8. CREATE subscription_refunds
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_refunds (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_payment_id   uuid NOT NULL REFERENCES public.subscription_payments(id),
  enrollment_id             uuid NOT NULL REFERENCES public.group_enrollments(id),
  group_removal_id          uuid REFERENCES public.group_removals(id),
  amount_ttd                numeric(12,2) NOT NULL CHECK (amount_ttd >= 0),
  status                    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  lunipay_refund_id         text,
  error_message             text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_refunds ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.subscription_refunds TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 9. CREATE subscription_payment_exceptions
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_payment_exceptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_payment_id   uuid REFERENCES public.subscription_payments(id),
  enrollment_id             uuid REFERENCES public.group_enrollments(id),
  group_id                  uuid REFERENCES public.groups(id),
  student_id                uuid REFERENCES public.profiles(id),
  exception_type            text NOT NULL
    CHECK (exception_type IN (
      'activation_failed', 'metadata_invalid', 'enrollment_missing',
      'duplicate_payment', 'capacity_conflict', 'refund_required'
    )),
  status                    text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'resolved', 'refunded', 'duplicate')),
  error_message             text,
  admin_id                  uuid REFERENCES public.profiles(id),
  admin_action              text,
  admin_notes               text,
  resolved_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payment_exceptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.subscription_payment_exceptions TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 10. RPCs
-- ─────────────────────────────────────────────────────────────

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
BEGIN
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

  IF v_sp.status = 'PAID' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'enrollment_id', v_sp.enrollment_id);
  END IF;

  v_grace_days := COALESCE(v_sp.grace_period_days, 7);

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

  UPDATE public.group_enrollments SET
    status                             = 'ACTIVE',
    payment_status                     = 'PAID',
    current_period_start               = v_period_start,
    current_period_end                 = v_period_end,
    next_payment_due_at                = v_period_end,
    grace_period_ends_at               = v_period_end + (v_grace_days * INTERVAL '1 day'),
    grace_period_days_snapshot         = v_grace_days,
    last_paid_at                       = now(),
    activated_subscription_payment_id  = v_sp_id,
    pending_payment_expires_at         = NULL,
    reminder_count                     = 0,
    last_reminder_sent_at              = NULL,
    expires_at                         = v_period_end
  WHERE id = v_sp.enrollment_id;

  IF COALESCE(v_payout, 0) > 0 THEN
    INSERT INTO public.payout_ledger (subscription_payment_id, tutor_id, amount_ttd, status)
    VALUES (v_sp_id, v_sp.tutor_id, v_payout, 'owed')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd)
    VALUES (v_sp.tutor_id, v_payout, 0)
    ON CONFLICT (tutor_id) DO UPDATE
    SET pending_ttd = public.tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
        last_updated = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', v_sp.enrollment_id,
    'status', 'ACTIVE',
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_subscription(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.check_subscription_access(p_student_id uuid, p_group_id uuid)
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

  UPDATE public.group_enrollments SET
    status         = 'CANCELLED',
    payment_status = CASE WHEN COALESCE(v_refund_amount, 0) > 0
                          THEN 'PARTIALLY_REFUNDED' ELSE payment_status END,
    cancelled_at   = now()
  WHERE id = v_enrollment_id;

  UPDATE public.group_members SET status = 'removed'
  WHERE group_id = v_e.group_id
    AND user_id  = v_e.student_id
    AND status NOT IN ('removed', 'banned');

  IF v_removal_id IS NOT NULL THEN
    UPDATE public.group_removals SET
      refund_issued     = COALESCE(v_refund_amount, 0) > 0,
      refund_amount_ttd = v_refund_amount,
      resolved_at       = now()
    WHERE id = v_removal_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', v_enrollment_id,
    'status', 'CANCELLED',
    'refund_issued', COALESCE(v_refund_amount, 0) > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_subscription_removal(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.process_waitlist_offer(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity int;
  v_used     int;
  v_entry    record;
BEGIN
  SELECT max_students INTO v_capacity FROM public.groups WHERE id = p_group_id;

  SELECT COUNT(*) INTO v_used
  FROM public.group_enrollments
  WHERE group_id = p_group_id AND enrollment_type = 'SUBSCRIPTION'
    AND (
      (status IN ('ACTIVE', 'GRACE', 'SUSPENDED'))
      OR (status = 'PENDING_PAYMENT' AND pending_payment_expires_at > now())
    );

  IF COALESCE(v_capacity, 20) <= v_used THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_capacity');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_waitlist_entries
    WHERE group_id = p_group_id AND status = 'offered' AND offer_expires_at > now()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offer_already_active');
  END IF;

  SELECT * INTO v_entry
  FROM public.group_waitlist_entries
  WHERE group_id = p_group_id AND status = 'waiting'
  ORDER BY position ASC LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_waiting_students');
  END IF;

  UPDATE public.group_waitlist_entries SET
    status           = 'offered',
    offered_at       = now(),
    offer_expires_at = now() + INTERVAL '48 hours'
  WHERE id = v_entry.id;

  RETURN jsonb_build_object(
    'ok', true,
    'waitlist_entry_id', v_entry.id,
    'student_id', v_entry.student_id,
    'offer_expires_at', now() + INTERVAL '48 hours'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_waitlist_offer(uuid) TO service_role;


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
    SET status = 'expired', expired_at = now()
    WHERE status = 'offered' AND offer_expires_at < now()
    RETURNING group_id
  )
  SELECT array_agg(DISTINCT group_id) INTO v_affected_groups FROM expired;

  RETURN jsonb_build_object(
    'ok', true,
    'affected_groups', COALESCE(v_affected_groups, '{}')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_waitlist_offers() TO service_role;

COMMIT;
