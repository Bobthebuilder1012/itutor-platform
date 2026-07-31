-- ============================================================
-- MIGRATION 198: MATERIALIZE PAID BOOKING (STRIPE)
-- iTutor Database
-- ============================================================
--
-- Stripe counterpart to materialize_paid_booking (migration 151).
--
-- The 1:1 booking flow is PAY-FIRST: no booking row exists until the
-- payment succeeds, so a tutor never sees a "ghost" CONFIRMED row for
-- a checkout the student abandoned. The webhook calls this to create
-- the booking and its payment row in ONE transaction — if either
-- insert fails the whole thing rolls back and Stripe retries.
--
-- 151 could not be reused: it hardcodes provider='lunipay' and writes
-- the lunipay_* columns. This is the same logic against the stripe_*
-- columns added in migration 197.
--
-- The EXCLUDE constraint from migration 155
-- (bookings_tutor_no_overlap) still guards double-booking; the caller
-- catches 23P01 and converts it into a refund case.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION materialize_paid_booking_stripe(
  p_student_id                 uuid,
  p_tutor_id                   uuid,
  p_subject_id                 uuid,
  p_session_type_id            uuid,
  p_payer_id                   uuid,
  p_requested_start_at         timestamptz,
  p_requested_end_at           timestamptz,
  p_duration_minutes           int,
  p_price_ttd                  numeric,
  p_platform_fee_pct           int,
  p_platform_fee_ttd           numeric,
  p_tutor_payout_ttd           numeric,
  p_student_notes              text,
  p_stripe_payment_intent_id   text,
  p_stripe_charge_id           text,
  p_provider_reference         text,
  p_amount_ttd                 numeric,
  p_charged_processing_fee_ttd numeric,
  p_raw_payload                jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.bookings (
    student_id,
    tutor_id,
    subject_id,
    session_type_id,
    requested_start_at,
    requested_end_at,
    confirmed_start_at,
    confirmed_end_at,
    duration_minutes,
    status,
    last_action_by,
    student_notes,
    price_ttd,
    payer_id,
    payment_required,
    payment_status,
    currency,
    platform_fee_pct,
    platform_fee_ttd,
    tutor_payout_ttd
  ) VALUES (
    p_student_id,
    p_tutor_id,
    p_subject_id,
    p_session_type_id,
    p_requested_start_at,
    p_requested_end_at,
    p_requested_start_at,
    p_requested_end_at,
    p_duration_minutes,
    'CONFIRMED',
    'student',
    p_student_notes,
    p_price_ttd,
    p_payer_id,
    true,
    'paid',
    'TTD',
    p_platform_fee_pct,
    p_platform_fee_ttd,
    p_tutor_payout_ttd
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.payments (
    booking_id,
    payer_id,
    provider,
    amount_ttd,
    status,
    stripe_payment_intent_id,
    stripe_charge_id,
    charged_processing_fee_ttd,
    provider_reference,
    paid_at,
    raw_provider_payload
  ) VALUES (
    v_booking_id,
    p_payer_id,
    'stripe',
    p_amount_ttd,
    'succeeded',
    p_stripe_payment_intent_id,
    p_stripe_charge_id,
    p_charged_processing_fee_ttd,
    p_provider_reference,
    now(),
    p_raw_payload
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'payment_id', v_payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION materialize_paid_booking_stripe TO service_role;

COMMIT;
