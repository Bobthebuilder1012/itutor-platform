-- =====================================================
-- BOOKING FUNCTIONS (CONTINUED)
-- Counter-offers and student actions
-- =====================================================

-- =====================================================
-- 5) TUTOR COUNTER OFFER
-- Tutor proposes alternative time
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_counter_offer(
    p_booking_id uuid,
    p_proposed_start_at timestamptz,
    p_proposed_end_at timestamptz,
    p_message text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_message_id uuid;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND tutor_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    -- Validate proposed time is available using calendar
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            p_proposed_start_at,
            p_proposed_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Proposed time slot is not available';
    END IF;

    -- Insert time proposal message
    INSERT INTO public.booking_messages (
        booking_id,
        sender_id,
        message_type,
        body,
        proposed_start_at,
        proposed_end_at
    ) VALUES (
        p_booking_id,
        auth.uid(),
        'time_proposal',
        COALESCE(p_message, 'Alternative time proposed'),
        p_proposed_start_at,
        p_proposed_end_at
    ) RETURNING id INTO v_message_id;

    -- Update booking status
    UPDATE public.bookings
    SET 
        status = 'COUNTER_PROPOSED',
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'COUNTER_PROPOSED',
        'message_id', v_message_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_counter_offer TO authenticated;

-- =====================================================
-- 6) STUDENT ACCEPT COUNTER OFFER
-- Student accepts tutor's proposed time (auto-confirms)
-- =====================================================
CREATE OR REPLACE FUNCTION student_accept_counter(
    p_booking_id uuid,
    p_message_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_proposal record;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND student_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    -- Get proposed time from message
    SELECT * INTO v_proposal
    FROM public.booking_messages
    WHERE id = p_message_id
    AND booking_id = p_booking_id
    AND message_type = 'time_proposal';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time proposal not found';
    END IF;

    -- Atomic conflict check for proposed time
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            v_proposal.proposed_start_at,
            v_proposal.proposed_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Proposed time slot is no longer available';
    END IF;

    -- Since tutor proposed, accepting auto-confirms
    UPDATE public.bookings
    SET 
        status = 'CONFIRMED',
        requested_start_at = v_proposal.proposed_start_at,
        requested_end_at = v_proposal.proposed_end_at,
        confirmed_start_at = v_proposal.proposed_start_at,
        confirmed_end_at = v_proposal.proposed_end_at,
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Student accepted counter-offer. Booking confirmed.');

    RETURN jsonb_build_object('success', true, 'status', 'CONFIRMED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION student_accept_counter TO authenticated;

-- =====================================================
-- 7) STUDENT CANCEL BOOKING
-- =====================================================
CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    -- Verify student owns this booking
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update status
    UPDATE public.bookings
    SET 
        status = 'CANCELLED',
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Add message if provided
    IF p_reason IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION student_cancel_booking TO authenticated;

-- =====================================================
-- 8) ADD BOOKING MESSAGE
-- Either party can send text messages
-- =====================================================
CREATE OR REPLACE FUNCTION add_booking_message(
    p_booking_id uuid,
    p_message text
) RETURNS jsonb AS $$
DECLARE
    v_message_id uuid;
    v_is_participant boolean;
BEGIN
    -- Verify sender is a participant
    SELECT EXISTS (
        SELECT 1 FROM public.bookings
        WHERE id = p_booking_id
        AND (student_id = auth.uid() OR tutor_id = auth.uid())
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RAISE EXCEPTION 'Unauthorized: You are not a participant in this booking';
    END IF;

    -- Insert message
    INSERT INTO public.booking_messages (
        booking_id,
        sender_id,
        message_type,
        body
    ) VALUES (
        p_booking_id,
        auth.uid(),
        'text',
        p_message
    ) RETURNING id INTO v_message_id;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_booking_message TO authenticated;

-- =====================================================
-- 9) GET TUTOR AVAILABILITY SUMMARY
-- Returns basic availability info for tutor profile display
-- =====================================================
CREATE OR REPLACE FUNCTION get_tutor_availability_summary(
    p_tutor_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_has_availability boolean;
    v_earliest_available timestamptz;
    v_days_with_hours jsonb;
BEGIN
    -- Check if tutor has any active availability rules
    SELECT EXISTS (
        SELECT 1 FROM public.tutor_availability_rules
        WHERE tutor_id = p_tutor_id AND is_active = true
    ) INTO v_has_availability;

    -- Get days of week with availability
    SELECT jsonb_agg(DISTINCT day_of_week ORDER BY day_of_week)
    INTO v_days_with_hours
    FROM public.tutor_availability_rules
    WHERE tutor_id = p_tutor_id AND is_active = true;

    -- Find earliest available slot in next 14 days
    WITH calendar AS (
        SELECT get_tutor_public_calendar(
            p_tutor_id,
            now(),
            now() + interval '14 days'
        ) as cal
    )
    SELECT MIN((slot->>'start_at')::timestamptz)
    INTO v_earliest_available
    FROM calendar,
    LATERAL jsonb_array_elements(cal->'available_slots') as slot;

    RETURN jsonb_build_object(
        'has_availability', v_has_availability,
        'days_with_hours', COALESCE(v_days_with_hours, '[]'::jsonb),
        'earliest_available', v_earliest_available
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_availability_summary TO authenticated;

-- =====================================================
-- 10) UPDATE TUTOR RESPONSE METRICS
-- Recalculate metrics for a tutor (called after tutor actions)
-- =====================================================
CREATE OR REPLACE FUNCTION update_tutor_response_metrics(
    p_tutor_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_avg_response_seconds int;
    v_total_bookings int;
    v_total_confirmed int;
BEGIN
    -- Calculate average first response time (time from booking creation to first tutor action)
    WITH first_responses AS (
        SELECT 
            b.id,
            b.created_at as request_time,
            MIN(b.updated_at) FILTER (WHERE b.last_action_by = 'tutor') as first_response_time
        FROM public.bookings b
        WHERE b.tutor_id = p_tutor_id
        AND b.created_at >= now() - interval '30 days'
        AND b.last_action_by = 'tutor'
        GROUP BY b.id, b.created_at
    )
    SELECT 
        AVG(EXTRACT(EPOCH FROM (first_response_time - request_time)))::int,
        COUNT(*),
        COUNT(*) FILTER (WHERE first_response_time IS NOT NULL)
    INTO v_avg_response_seconds, v_total_bookings, v_total_confirmed
    FROM first_responses
    WHERE first_response_time IS NOT NULL;

    -- Upsert metrics
    INSERT INTO public.tutor_response_metrics (
        tutor_id,
        avg_first_response_seconds_30d,
        total_bookings_30d,
        total_confirmed_30d,
        updated_at
    ) VALUES (
        p_tutor_id,
        v_avg_response_seconds,
        v_total_bookings,
        v_total_confirmed,
        now()
    )
    ON CONFLICT (tutor_id)
    DO UPDATE SET
        avg_first_response_seconds_30d = v_avg_response_seconds,
        total_bookings_30d = v_total_bookings,
        total_confirmed_30d = v_total_confirmed,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'avg_response_seconds', v_avg_response_seconds
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_tutor_response_metrics TO authenticated;

-- Verify all functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'get_tutor_public_calendar',
    'create_booking_request',
    'tutor_confirm_booking',
    'tutor_decline_booking',
    'tutor_counter_offer',
    'student_accept_counter',
    'student_cancel_booking',
    'add_booking_message',
    'get_tutor_availability_summary',
    'update_tutor_response_metrics'
)
ORDER BY routine_name;














