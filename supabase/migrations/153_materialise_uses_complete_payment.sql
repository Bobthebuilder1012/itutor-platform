-- ============================================================
-- 153_materialise_uses_complete_payment.sql
-- ============================================================
-- Audit Medium #16: materialize_paid_booking inserted both rows in
-- their final state ('CONFIRMED' + 'paid' + 'succeeded') and never
-- called complete_booking_payment, diverging from the documented
-- contract that complete_booking_payment is the single source of
-- truth for the "payment captured → booking paid" state transition.
--
-- Functionally equivalent before vs after: end state is the same.
-- Architecturally cleaner: the state transition lives in exactly
-- one RPC. Atomicity is preserved because everything still runs in
-- a single PL/pgSQL function (one transaction).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION materialize_paid_booking(
  p_student_id              uuid,
  p_tutor_id                uuid,
  p_subject_id              uuid,
  p_session_type_id         uuid,
  p_payer_id                uuid,
  p_requested_start_at      timestamptz,
  p_requested_end_at        timestamptz,
  p_duration_minutes        int,
  p_price_ttd               numeric,
  p_platform_fee_pct        int,
  p_platform_fee_ttd        numeric,
  p_tutor_payout_ttd        numeric,
  p_student_notes           text,
  p_lunipay_session_id      text,
  p_lunipay_payment_id      text,
  p_lunipay_payment_intent_id text,
  p_provider_reference      text,
  p_amount_ttd              numeric,
  p_raw_payload             jsonb
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
  -- ---- 1. Booking: insert in pre-paid state ----
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
    'unpaid',          -- complete_booking_payment will flip this to 'paid'
    'TTD',
    p_platform_fee_pct,
    p_platform_fee_ttd,
    p_tutor_payout_ttd
  )
  RETURNING id INTO v_booking_id;

  -- ---- 2. Payment: insert in pre-captured state ----
  INSERT INTO public.payments (
    booking_id,
    payer_id,
    provider,
    amount_ttd,
    status,
    lunipay_checkout_session_id,
    lunipay_payment_id,
    lunipay_payment_intent_id,
    paid_at,
    raw_provider_payload
  ) VALUES (
    v_booking_id,
    p_payer_id,
    'lunipay',
    p_amount_ttd,
    'initiated',       -- complete_booking_payment will flip this to 'succeeded'
    p_lunipay_session_id,
    p_lunipay_payment_id,
    p_lunipay_payment_intent_id,
    now(),
    p_raw_payload
  )
  RETURNING id INTO v_payment_id;

  -- ---- 3. Hand the state transition to the canonical RPC ----
  -- complete_booking_payment owns the:
  --   bookings.payment_status   'unpaid' -> 'paid'
  --   payments.status           'initiated' -> 'succeeded'
  --   payments.provider_reference set
  -- ...transition. It also covers a PARENT_APPROVED -> PENDING flip
  -- that doesn't apply here (we insert with 'CONFIRMED'), but calling
  -- the RPC means the contract has exactly one home.
  PERFORM complete_booking_payment(
    v_booking_id,
    v_payment_id,
    p_provider_reference
  );

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'payment_id', v_payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION materialize_paid_booking TO service_role;

COMMIT;

-- ============================================================
-- Verification:
--   SELECT pg_get_functiondef(oid)
--     FROM pg_proc
--    WHERE proname = 'materialize_paid_booking';
--   -- Body should contain "PERFORM complete_booking_payment".
-- ============================================================
