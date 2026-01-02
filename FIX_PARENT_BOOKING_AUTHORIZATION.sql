-- =====================================================
-- FIX PARENT BOOKING AUTHORIZATION
-- =====================================================
-- Allow parents to create bookings for their children
-- Updates the create_booking_request function to check for parent-child relationship

-- Drop all existing versions of the function to avoid conflicts
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, numeric);
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, numeric, int);

-- Create the updated function with parent authorization
CREATE OR REPLACE FUNCTION create_booking_request(
    p_tutor_id uuid,
    p_student_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT '',
    p_price_ttd numeric DEFAULT NULL,
    p_duration_minutes int DEFAULT 60
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_calculated_price numeric;
    v_tutor_hourly_rate numeric;
    v_actual_duration_minutes int;
    v_is_parent boolean := false;
BEGIN
    -- Validate auth: Allow if user is the student OR if user is the parent of the student
    IF auth.uid() != p_student_id THEN
        -- Check if authenticated user is a parent of this student
        SELECT EXISTS(
            SELECT 1 
            FROM parent_child_links 
            WHERE parent_id = auth.uid() 
            AND child_id = p_student_id
        ) INTO v_is_parent;
        
        IF NOT v_is_parent THEN
            RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself or your children';
        END IF;
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
        duration_minutes,
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
        v_actual_duration_minutes,
        'PENDING',
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    -- Create notification for tutor
    INSERT INTO notifications (recipient_id, sender_id, type, message, link, created_at)
    VALUES (
        p_tutor_id,
        p_student_id,  -- Notification appears to come from the student
        'booking_request_received',
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

