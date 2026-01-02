-- =====================================================
-- COMPLETE FIX FOR PARENT BOOKING
-- =====================================================
-- This script fixes:
-- 1. Missing duration_minutes column
-- 2. Parent authorization for bookings

-- =====================================================
-- STEP 1: ADD MISSING COLUMN TO BOOKINGS TABLE
-- =====================================================

-- Add duration_minutes column if it doesn't exist
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

-- Update existing bookings to have duration based on time difference
UPDATE bookings 
SET duration_minutes = EXTRACT(EPOCH FROM (
    COALESCE(confirmed_end_at, requested_end_at) - 
    COALESCE(confirmed_start_at, requested_start_at)
)) / 60
WHERE duration_minutes IS NULL OR duration_minutes = 60;

-- =====================================================
-- STEP 2: DROP ALL EXISTING FUNCTION VERSIONS
-- =====================================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 
            'DROP FUNCTION IF EXISTS ' || 
            oid::regprocedure || ' CASCADE;' AS drop_statement
        FROM pg_proc 
        WHERE proname = 'create_booking_request'
    LOOP
        EXECUTE r.drop_statement;
    END LOOP;
END $$;

-- =====================================================
-- STEP 3: CREATE NEW FUNCTION WITH PARENT AUTHORIZATION
-- =====================================================

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

    -- Validate consecutive slots are available (if function exists)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_consecutive_slots') THEN
        IF NOT validate_consecutive_slots(p_tutor_id, p_requested_start_at, v_actual_duration_minutes) THEN
            RAISE EXCEPTION 'The requested time slot(s) are not available. Please choose a different time.';
        END IF;
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
-- STEP 4: GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- =====================================================
-- STEP 5: VERIFY SUCCESS
-- =====================================================

-- Check column was added
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'bookings' 
            AND column_name = 'duration_minutes'
        )
        THEN '✅ Column duration_minutes exists'
        ELSE '❌ Column duration_minutes missing'
    END AS column_status;

-- Check function was created
SELECT 
    '✅ Function created: ' || oid::regprocedure AS function_status
FROM pg_proc 
WHERE proname = 'create_booking_request';

