-- ============================================================
-- 151_atomic_paid_booking_and_payer.sql
-- ============================================================
-- Two related fixes:
--
-- 1. materialize_paid_booking(...)
--    Atomic booking + payment insert for the LuniPay create_booking
--    flow. Webhook and finalize routes both call this RPC instead of
--    issuing two separate SQL inserts. If the payment insert fails,
--    the booking insert is rolled back automatically — no orphan
--    CONFIRMED bookings without a matching payment row. (audit High #9)
--
-- 2. create_booking_request rewritten to set payer_id via
--    get_payer_for_student(...). The canonical version in mig 128
--    inserted the booking with NULL payer_id, breaking
--    /api/payments/lunipay/initiate's authorisation check. (audit High #5)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Atomic materialise for the create_booking pre-pay flow
-- ------------------------------------------------------------
-- Returns: { booking_id, payment_id }
-- Idempotency: the caller already checks for an existing payment by
-- lunipay_checkout_session_id BEFORE calling this. We do not duplicate
-- that check here.
--
-- Conflict semantics: if the booking insert hits a constraint (e.g.
-- the unique (booking_id) WHERE status IN ('initiated', 'requires_action')
-- partial index) the function raises and the whole RPC rolls back.

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
    lunipay_checkout_session_id,
    lunipay_payment_id,
    lunipay_payment_intent_id,
    provider_reference,
    paid_at,
    raw_provider_payload
  ) VALUES (
    v_booking_id,
    p_payer_id,
    'lunipay',
    p_amount_ttd,
    'succeeded',
    p_lunipay_session_id,
    p_lunipay_payment_id,
    p_lunipay_payment_intent_id,
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

GRANT EXECUTE ON FUNCTION materialize_paid_booking TO service_role;

-- ------------------------------------------------------------
-- 2. create_booking_request — set payer_id via get_payer_for_student
-- ------------------------------------------------------------
-- Same 7-arg signature as mig 128. Adds a single line to compute the
-- payer (parent if billing_mode='parent_required', else self) and
-- store it on the inserted booking.

CREATE OR REPLACE FUNCTION public.create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_calendar jsonb;
    v_payer_id uuid;
BEGIN
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    SELECT price_ttd INTO v_price_ttd
    FROM public.session_types
    WHERE id = p_session_type_id
      AND tutor_id = p_tutor_id
      AND is_active = true;

    IF v_price_ttd IS NULL THEN
        RAISE EXCEPTION 'Invalid session type';
    END IF;

    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start_at, p_requested_end_at);

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_calendar->'busy_blocks') AS bb
        WHERE time_ranges_overlap(
            p_requested_start_at,
            p_requested_end_at,
            (bb->>'start_at')::timestamptz,
            (bb->>'end_at')::timestamptz
        )
    ) THEN
        RAISE EXCEPTION 'Requested time slot is not available';
    END IF;

    -- Resolve payer (parent for parent_required billing, else student)
    v_payer_id := public.get_payer_for_student(p_student_id);

    INSERT INTO public.bookings (
        student_id,
        tutor_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        status,
        last_action_by,
        price_ttd,
        student_notes,
        payer_id
    ) VALUES (
        p_student_id,
        p_tutor_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        'PENDING',
        'student',
        v_price_ttd,
        p_student_notes,
        v_payer_id
    ) RETURNING id INTO v_booking_id;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_request(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text
) TO authenticated;

COMMIT;

-- ============================================================
-- Verification:
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('materialize_paid_booking', 'create_booking_request');
--   -- 2 rows
-- ============================================================
