-- Add duration validation and helper functions for variable session durations
-- This allows students and tutors to book sessions of any length (30min - 5 hours)

-- =====================================================
-- 1. CREATE VALIDATION FUNCTION
-- =====================================================

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

-- =====================================================
-- 2. UPDATE STUDENT_REQUEST_BOOKING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION student_request_booking(
    p_tutor_id uuid,
    p_student_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT '',
    p_price_ttd numeric DEFAULT NULL,
    p_duration_minutes int DEFAULT 60  -- NEW: Optional duration parameter
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_calculated_price numeric;
    v_tutor_hourly_rate numeric;
    v_actual_duration_minutes int;
BEGIN
    -- Validate auth
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

    -- Validate consecutive slots are available
    IF NOT validate_consecutive_slots(p_tutor_id, p_requested_start_at, v_actual_duration_minutes) THEN
        RAISE EXCEPTION 'The requested time slot(s) are not available. Please choose a different time.';
    END IF;

    -- Get tutor's hourly rate for this subject
    SELECT price_per_hour_ttd INTO v_tutor_hourly_rate
    FROM tutor_subjects
    WHERE tutor_id = p_tutor_id
    AND subject_id = p_subject_id
    LIMIT 1;

    IF v_tutor_hourly_rate IS NULL THEN
        RAISE EXCEPTION 'Tutor does not teach this subject';
    END IF;

    -- Calculate price based on duration
    v_calculated_price := COALESCE(p_price_ttd, (v_tutor_hourly_rate / 60.0) * v_actual_duration_minutes);

    -- Insert booking
    INSERT INTO bookings (
        tutor_id,
        student_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        student_notes,
        price_ttd,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_tutor_id,
        p_student_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        p_student_notes,
        v_calculated_price,
        'PENDING',
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    -- Create notification for tutor
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        p_tutor_id,
        'booking_request_received',
        'New Booking Request',
        'You have a new booking request',
        '/tutor/bookings/' || v_booking_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'price', v_calculated_price,
        'duration_minutes', v_actual_duration_minutes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. UPDATE TUTOR_CONFIRM_BOOKING FUNCTION
-- =====================================================

-- This function already handles confirmed_start_at and confirmed_end_at
-- We just need to ensure it respects the duration from the booking
-- The existing function should work, but let's add duration validation

CREATE OR REPLACE FUNCTION tutor_confirm_booking(
    p_booking_id uuid,
    p_confirmed_start_at timestamptz DEFAULT NULL,
    p_confirmed_end_at timestamptz DEFAULT NULL,
    p_tutor_notes text DEFAULT ''
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_duration_minutes int;
BEGIN
    -- Get booking
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    -- Validate auth
    IF auth.uid() != v_booking.tutor_id THEN
        RAISE EXCEPTION 'Unauthorized: Only the tutor can confirm this booking';
    END IF;

    -- Use provided times or fall back to requested times
    p_confirmed_start_at := COALESCE(p_confirmed_start_at, v_booking.requested_start_at);
    p_confirmed_end_at := COALESCE(p_confirmed_end_at, v_booking.requested_end_at);

    -- Calculate duration
    v_duration_minutes := EXTRACT(EPOCH FROM (p_confirmed_end_at - p_confirmed_start_at)) / 60;

    -- Validate duration
    IF v_duration_minutes < 30 THEN
        RAISE EXCEPTION 'Duration must be at least 30 minutes';
    END IF;
    
    IF v_duration_minutes > 300 THEN
        RAISE EXCEPTION 'Duration cannot exceed 5 hours (300 minutes)';
    END IF;

    -- Validate no conflicts with confirmed bookings
    IF NOT validate_consecutive_slots(v_booking.tutor_id, p_confirmed_start_at, v_duration_minutes) THEN
        RAISE EXCEPTION 'You have a conflict with another confirmed booking at this time';
    END IF;

    -- Update booking
    UPDATE bookings
    SET 
        status = 'CONFIRMED',
        confirmed_start_at = p_confirmed_start_at,
        confirmed_end_at = p_confirmed_end_at,
        tutor_notes = COALESCE(NULLIF(p_tutor_notes, ''), tutor_notes),
        updated_at = now()
    WHERE id = p_booking_id;

    -- Create notification for student
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        v_booking.student_id,
        'booking_confirmed',
        'Booking Confirmed',
        'Your booking has been confirmed by the tutor',
        '/student/bookings/' || p_booking_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'confirmed_start_at', p_confirmed_start_at,
        'confirmed_end_at', p_confirmed_end_at,
        'duration_minutes', v_duration_minutes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. UPDATE CREATE_BOOKING_REQUEST FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL,
    p_duration_minutes int DEFAULT 60  -- NEW: Optional duration parameter
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

    -- Validate consecutive slots are available
    IF NOT validate_consecutive_slots(p_tutor_id, p_requested_start_at, v_actual_duration_minutes) THEN
        RAISE EXCEPTION 'The requested time slot(s) are not available. Please choose a different time.';
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

-- =====================================================
-- 5. ADD HELPER FOR PRICE CALCULATION
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_session_price(
    p_hourly_rate numeric,
    p_duration_minutes int
) RETURNS numeric AS $$
BEGIN
    RETURN (p_hourly_rate / 60.0) * p_duration_minutes;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION calculate_session_price TO authenticated;

-- =====================================================
-- 6. ADD COUNTER_DURATION_MINUTES TO LESSON_OFFERS
-- =====================================================

-- Add counter_duration_minutes column to lesson_offers table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'lesson_offers' 
        AND column_name = 'counter_duration_minutes'
    ) THEN
        ALTER TABLE public.lesson_offers 
        ADD COLUMN counter_duration_minutes INTEGER;
        
        ALTER TABLE public.lesson_offers 
        ADD CONSTRAINT valid_counter_duration 
        CHECK (counter_duration_minutes IS NULL OR (counter_duration_minutes >= 30 AND counter_duration_minutes <= 300));
    END IF;
END$$;

-- =====================================================
-- NOTES
-- =====================================================

-- This migration adds:
-- 1. validate_consecutive_slots() - Checks if a time range is available
-- 2. Updates student_request_booking() to accept duration and validate
-- 3. Updates tutor_confirm_booking() to validate duration
-- 4. calculate_session_price() helper for consistent pricing

-- To apply: Run this in Supabase SQL Editor
-- Backwards compatible: Defaults to 60 minutes if duration not provided

