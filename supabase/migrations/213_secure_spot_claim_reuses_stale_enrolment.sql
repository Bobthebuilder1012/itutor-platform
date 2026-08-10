-- ============================================================
-- MIGRATION 213: secure_spot_claim reuses a stale enrolment
-- iTutor Database
-- ============================================================
--
-- Reserving a place failed with "Could not reserve a place" for any student
-- who had previously abandoned a subscription checkout on that class.
--
-- Such a student keeps a PENDING_PAYMENT enrolment, and
-- uq_group_enrollments_student_group_active_subscription covers
-- (student_id, group_id) for every status except CANCELLED, COMPLETED and
-- ACTIVATION_FAILED — so PENDING_PAYMENT is covered by it.
--
-- The claim's "already enrolled?" test deliberately ignores checkouts whose
-- window has expired, because their seat is free again. It therefore fell
-- through to an INSERT that the index rejected with 23505, and the student
-- could never reserve that class again — permanently, because of a checkout
-- they abandoned once.
--
-- /subscribe had already met this and solved it by reusing the row rather
-- than inserting ("Inserting a new row would violate the unique index").
-- The claim now does the same, and retires the stale PENDING payment so it
-- cannot look like an outstanding charge against the reservation that
-- replaced it.
--
-- Only abandoned checkouts can reach the takeover: live seats and open
-- windows return 'already_enrolled' before it.
--
-- Verified on staging against the exact failing account: one enrolment row
-- (reused, not duplicated), the abandoned payment marked expired, one new
-- secure-spot payment, and an immediate second attempt correctly refused.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.secure_spot_claim(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_group_id     uuid    := (p_payload->>'group_id')::uuid;
  v_student_id   uuid    := (p_payload->>'student_id')::uuid;
  v_amount       numeric := COALESCE((p_payload->>'amount_ttd')::numeric, 0);
  v_platform_fee numeric := COALESCE((p_payload->>'platform_fee_ttd')::numeric, 0);
  v_payout       numeric := COALESCE((p_payload->>'tutor_payout_ttd')::numeric, 0);
  v_hold_minutes int     := COALESCE((p_payload->>'hold_minutes')::int, 30);
  v_group        record;
  v_expires      timestamptz;
  v_enrollment   uuid;
  v_existing     uuid;
  v_sp_id        uuid;
BEGIN
  IF v_group_id IS NULL OR v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  END IF;

  SELECT id, tutor_id, max_students, secure_spot_enabled, archived_at
  INTO v_group
  FROM public.groups
  WHERE id = v_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_not_found');
  END IF;

  IF v_group.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_archived');
  END IF;

  IF NOT COALESCE(v_group.secure_spot_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'secure_spot_not_enabled');
  END IF;

  IF v_group.tutor_id = v_student_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tutor_cannot_enrol');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_enrollments
    WHERE group_id = v_group_id
      AND student_id = v_student_id
      AND (
        status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
        OR (status IN ('PENDING_PAYMENT', 'SECURED_PENDING_PAYMENT')
            AND pending_payment_expires_at > now())
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_enrolled');
  END IF;

  IF public.secure_spot_seats_used(v_group_id) >= COALESCE(v_group.max_students, 20) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_capacity');
  END IF;

  v_expires := now() + (v_hold_minutes || ' minutes')::interval;

  -- Take over any leftover row the unique index would collide with.
  SELECT id INTO v_existing
  FROM public.group_enrollments
  WHERE group_id = v_group_id
    AND student_id = v_student_id
    AND enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.group_enrollments SET
      status                     = 'SECURED_PENDING_PAYMENT',
      payment_status             = CASE WHEN v_amount > 0 THEN 'PENDING' ELSE 'FREE' END,
      plan_price_ttd             = v_amount,
      pending_payment_expires_at = v_expires,
      billing_provider           = 'stripe',
      secured_at                 = NULL,
      secure_payment_intent_id   = NULL,
      release_date               = NULL,
      updated_at                 = now()
    WHERE id = v_existing;

    UPDATE public.subscription_payments
    SET status = 'expired'
    WHERE enrollment_id = v_existing AND status = 'PENDING';

    v_enrollment := v_existing;
  ELSE
    INSERT INTO public.group_enrollments (
      student_id, group_id, enrollment_type, status, payment_status,
      plan_price_ttd, pending_payment_expires_at, billing_provider, enrolled_at
    ) VALUES (
      v_student_id, v_group_id, 'SUBSCRIPTION', 'SECURED_PENDING_PAYMENT',
      CASE WHEN v_amount > 0 THEN 'PENDING' ELSE 'FREE' END,
      v_amount, v_expires, 'stripe', now()
    )
    RETURNING id INTO v_enrollment;
  END IF;

  IF v_amount > 0 THEN
    INSERT INTO public.subscription_payments (
      enrollment_id, group_id, student_id, type, amount_ttd,
      platform_fee_ttd, tutor_payout_ttd, status, checkout_expires_at
    ) VALUES (
      v_enrollment, v_group_id, v_student_id, 'secure_spot', v_amount,
      v_platform_fee, v_payout, 'PENDING', v_expires
    )
    RETURNING id INTO v_sp_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', v_enrollment,
    'subscription_payment_id', v_sp_id,
    'reused_enrollment', v_existing IS NOT NULL,
    'expires_at', v_expires,
    'seats_used', public.secure_spot_seats_used(v_group_id),
    'max_students', COALESCE(v_group.max_students, 20)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.secure_spot_claim(jsonb) TO service_role;

COMMIT;
