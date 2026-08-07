-- ============================================================
-- MIGRATION 214: a student can resume their own abandoned checkout
-- iTutor Database
-- ============================================================
--
-- Closing the payment sheet and pressing "Secure your spot" again answered
-- "You've already got a place in this class." for the next 30 minutes.
--
-- The place it had found was the student's OWN hold. 213 taught the claim to
-- take over a leftover row, but the guard above it still returned
-- already_enrolled for any open SECURED_PENDING_PAYMENT window, so the takeover
-- was unreachable for exactly the case it was written for. 213's own header
-- called that intended; it is not. The whole guard is scoped to this student,
-- so an open window can only ever be their own reservation, and re-opening
-- your own reservation is the normal thing to do after closing a payment sheet
-- by accident.
--
-- already_enrolled now means what it says: a place the student actually holds
-- (SECURED, ACTIVE, GRACE, SUSPENDED). An unpaid window falls through to the
-- takeover, which resets the hold and retires the abandoned payment.
--
-- The reusable row is therefore found BEFORE the capacity check, so the check
-- can exclude it. Otherwise a student resuming a checkout on the last seat
-- would be turned away by their own hold.
--
-- The claim also now reports the payment intent it superseded. The caller
-- cancels it, so a checkout tab left open on the old intent cannot be paid
-- after a newer one has replaced it.
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
  v_superseded   text;
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

  -- A place they actually hold. An unpaid hold is deliberately NOT one of
  -- these: it is theirs to resume, not a reason to turn them away.
  IF EXISTS (
    SELECT 1 FROM public.group_enrollments
    WHERE group_id = v_group_id
      AND student_id = v_student_id
      AND status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_enrolled');
  END IF;

  -- Found before the capacity check so the check can discount it. Their own
  -- hold must not be what makes the class look full to them.
  SELECT id INTO v_existing
  FROM public.group_enrollments
  WHERE group_id = v_group_id
    AND student_id = v_student_id
    AND enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF public.secure_spot_seats_used(v_group_id, v_existing) >= COALESCE(v_group.max_students, 20) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_capacity');
  END IF;

  v_expires := now() + (v_hold_minutes || ' minutes')::interval;

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

    -- Retire the abandoned attempt and report its intent, so it cannot look
    -- like an outstanding charge against the reservation replacing it.
    SELECT stripe_payment_intent_id INTO v_superseded
    FROM public.subscription_payments
    WHERE enrollment_id = v_existing
      AND status = 'PENDING'
      AND stripe_payment_intent_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

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
    'superseded_payment_intent_id', v_superseded,
    'expires_at', v_expires,
    'seats_used', public.secure_spot_seats_used(v_group_id),
    'max_students', COALESCE(v_group.max_students, 20)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.secure_spot_claim(jsonb) TO service_role;

COMMIT;
