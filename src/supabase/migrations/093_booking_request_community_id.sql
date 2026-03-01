-- =====================================================
-- create_booking_request: accept optional p_community_id (spec Phase 4)
-- =====================================================
-- Drop old 7-arg version so the 8-arg version is unique
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL,
    p_community_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_is_available boolean;
    v_calendar jsonb;
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
        SELECT 1 FROM jsonb_array_elements(v_calendar->'busy_blocks') as bb
        WHERE time_ranges_overlap(
            p_requested_start_at,
            p_requested_end_at,
            (bb->>'start_at')::timestamptz,
            (bb->>'end_at')::timestamptz
        )
    ) THEN
        RAISE EXCEPTION 'Requested time slot is not available';
    END IF;

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
        community_id
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
        p_community_id
    ) RETURNING id INTO v_booking_id;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ create_booking_request community_id migration 093 applied';
END $$;
