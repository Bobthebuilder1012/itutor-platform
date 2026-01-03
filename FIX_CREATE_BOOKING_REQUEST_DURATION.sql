-- Fix create_booking_request to accept duration parameter
-- This updates the existing function to support variable durations

-- Drop the old version if it exists
DROP FUNCTION IF EXISTS public.create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);

-- Create new version with duration parameter
CREATE OR REPLACE FUNCTION public.create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL,
    p_duration_minutes int DEFAULT NULL  -- NEW: Optional duration parameter
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_is_available boolean;
    v_calendar jsonb;
    v_actual_duration_minutes int;
    v_tutor_hourly_rate numeric;
BEGIN
    -- Validate requester is the student
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    -- Calculate actual duration from timestamps if not provided
    v_actual_duration_minutes := COALESCE(
        p_duration_minutes,
        EXTRACT(EPOCH FROM (p_requested_end_at - p_requested_start_at)) / 60
    );

    -- Validate duration bounds
    IF v_actual_duration_minutes < 30 THEN
        RAISE EXCEPTION 'Duration must be at least 30 minutes';
    END IF;
    
    IF v_actual_duration_minutes > 300 THEN
        RAISE EXCEPTION 'Duration cannot exceed 5 hours (300 minutes)';
    END IF;

    -- Get tutor's hourly rate for this subject (primary method)
    SELECT price_per_hour_ttd INTO v_tutor_hourly_rate
    FROM tutor_subjects
    WHERE tutor_id = p_tutor_id
    AND subject_id = p_subject_id
    LIMIT 1;

    -- If no tutor_subjects rate, try session_types as fallback
    IF v_tutor_hourly_rate IS NULL THEN
        SELECT price_ttd INTO v_price_ttd
        FROM public.session_types
        WHERE id = p_session_type_id
        AND tutor_id = p_tutor_id
        AND is_active = true;
        
        IF v_price_ttd IS NULL THEN
            RAISE EXCEPTION 'Tutor does not teach this subject or invalid session type';
        END IF;
    ELSE
        -- Calculate price based on duration
        v_price_ttd := (v_tutor_hourly_rate / 60.0) * v_actual_duration_minutes;
    END IF;

    -- Check if requested slot is available using existing calendar function
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

    RETURN jsonb_build_object(
        'success', true, 
        'booking_id', v_booking_id,
        'price', v_price_ttd,
        'duration_minutes', v_actual_duration_minutes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_booking_request TO authenticated;

-- Add the validate_consecutive_slots helper function if it doesn't exist
CREATE OR REPLACE FUNCTION validate_consecutive_slots(
    p_tutor_id uuid,
    p_start_at timestamptz,
    p_duration_minutes int
) RETURNS boolean AS $$
DECLARE
    v_end_at timestamptz;
    v_busy_count int;
BEGIN
    v_end_at := p_start_at + (p_duration_minutes * interval '1 minute');
    
    -- Check if any busy periods overlap with requested time
    SELECT COUNT(*) INTO v_busy_count
    FROM (
        -- Confirmed bookings
        SELECT confirmed_start_at, confirmed_end_at
        FROM bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_start_at, v_end_at)
        
        UNION ALL
        
        -- Unavailability blocks
        SELECT start_at, end_at
        FROM tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_start_at, v_end_at)
    ) busy;
    
    RETURN v_busy_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION validate_consecutive_slots TO authenticated;






