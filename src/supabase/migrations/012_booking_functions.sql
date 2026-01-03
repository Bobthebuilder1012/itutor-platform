-- =====================================================
-- BOOKING SYSTEM FUNCTIONS
-- Core logic for availability and booking actions
-- =====================================================

-- HELPER: Check if a time range overlaps with another
CREATE OR REPLACE FUNCTION time_ranges_overlap(
    start1 timestamptz,
    end1 timestamptz,
    start2 timestamptz,
    end2 timestamptz
) RETURNS boolean AS $$
BEGIN
    RETURN start1 < end2 AND end1 > start2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 1) GET TUTOR PUBLIC CALENDAR
-- Returns available slots and busy blocks (no private reasons)
-- =====================================================
CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_available_slots jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
BEGIN
    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build available slots from availability rules
    -- For MVP: generate all slots, then filter out busy ones
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    availability_windows AS (
        SELECT 
            (ds.day + ar.start_time)::timestamptz as window_start,
            (ds.day + ar.end_time)::timestamptz as window_end,
            ar.slot_minutes,
            ar.buffer_minutes
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND (ds.day + ar.start_time)::timestamptz >= p_range_start
        AND (ds.day + ar.end_time)::timestamptz <= p_range_end
    ),
    generated_slots AS (
        SELECT 
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') as slot_start,
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') + (slot_minutes * interval '1 minute') as slot_end
        FROM availability_windows,
        LATERAL generate_series(
            0,
            FLOOR(EXTRACT(EPOCH FROM (window_end - window_start)) / 60 / (slot_minutes + buffer_minutes))::int - 1
        ) as n
    ),
    -- Get all busy periods (confirmed bookings + unavailability blocks)
    busy_periods AS (
        -- Confirmed bookings
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        -- Unavailability blocks
        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    -- Filter available slots (exclude those overlapping with busy periods)
    available AS (
        SELECT gs.slot_start, gs.slot_end
        FROM generated_slots gs
        WHERE NOT EXISTS (
            SELECT 1 FROM busy_periods bp
            WHERE time_ranges_overlap(gs.slot_start, gs.slot_end, bp.busy_start, bp.busy_end)
        )
        AND gs.slot_start >= now() + interval '1 hour' -- Min 1 hour notice
    )
    SELECT jsonb_agg(
        jsonb_build_object('start_at', slot_start, 'end_at', slot_end)
        ORDER BY slot_start
    ) INTO v_available_slots
    FROM available;

    -- Build busy blocks (merge adjacent/overlapping periods)
    WITH busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at, end_at, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return combined result
    v_result := jsonb_build_object(
        'available_slots', COALESCE(v_available_slots, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- =====================================================
-- 2) CREATE BOOKING REQUEST
-- Students create a booking request
-- =====================================================
CREATE OR REPLACE FUNCTION create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_is_available boolean;
    v_calendar jsonb;
BEGIN
    -- Validate requester is the student
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    -- Get price from session type
    SELECT price_ttd INTO v_price_ttd
    FROM public.session_types
    WHERE id = p_session_type_id
    AND tutor_id = p_tutor_id
    AND is_active = true;

    IF v_price_ttd IS NULL THEN
        RAISE EXCEPTION 'Invalid session type';
    END IF;

    -- Check if requested slot is available
    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start_at, p_requested_end_at);
    
    -- Simple check: ensure slot doesn't overlap with busy blocks
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

    -- Insert booking
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
        student_notes
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
        p_student_notes
    ) RETURNING id INTO v_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- =====================================================
-- 3) TUTOR CONFIRM BOOKING
-- Tutor confirms a booking request
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_confirm_booking(
    p_booking_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND tutor_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    IF v_booking.status != 'PENDING' AND v_booking.status != 'COUNTER_PROPOSED' THEN
        RAISE EXCEPTION 'Booking cannot be confirmed in current status: %', v_booking.status;
    END IF;

    -- Atomic conflict check: ensure no confirmed booking overlaps
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            v_booking.requested_start_at,
            v_booking.requested_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Time slot is no longer available due to another confirmed booking';
    END IF;

    -- Check unavailability blocks
    IF EXISTS (
        SELECT 1 FROM public.tutor_unavailability_blocks
        WHERE tutor_id = v_booking.tutor_id
        AND time_ranges_overlap(
            start_at,
            end_at,
            v_booking.requested_start_at,
            v_booking.requested_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Time slot conflicts with your unavailability block';
    END IF;

    -- Update booking to confirmed
    UPDATE public.bookings
    SET 
        status = 'CONFIRMED',
        confirmed_start_at = requested_start_at,
        confirmed_end_at = requested_end_at,
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking confirmed by tutor');

    RETURN jsonb_build_object('success', true, 'status', 'CONFIRMED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_confirm_booking TO authenticated;

-- =====================================================
-- 4) TUTOR DECLINE BOOKING
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_decline_booking(
    p_booking_id uuid,
    p_message text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_tutor_id uuid;
BEGIN
    -- Verify tutor owns this booking
    SELECT tutor_id INTO v_tutor_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_tutor_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update status
    UPDATE public.bookings
    SET 
        status = 'DECLINED',
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    -- Add message if provided
    IF p_message IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_message);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking declined by tutor');

    RETURN jsonb_build_object('success', true, 'status', 'DECLINED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_decline_booking TO authenticated;

-- Verify functions
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%booking%'
ORDER BY routine_name;








