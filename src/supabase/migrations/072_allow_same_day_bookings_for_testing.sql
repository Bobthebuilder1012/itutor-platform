-- =====================================================
-- Add Same-Day Booking Feature for Testing
-- Allow specific tutors to accept same-day bookings
-- =====================================================

-- Step 1: Add column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allow_same_day_bookings boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.allow_same_day_bookings IS 
'Allows tutor to accept bookings on the same day (bypasses 24-hour advance notice requirement). Primarily for testing.';

-- Step 2: Enable same-day bookings for the test user
UPDATE public.profiles
SET allow_same_day_bookings = true
WHERE email = 'jovangoodluck@myitutor.com'
AND role = 'tutor';

-- Step 3: Update create_booking_request function to check this flag
-- Drop all versions of the function using DO block
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;' as drop_statement
        FROM pg_proc 
        WHERE proname = 'create_booking_request'
    LOOP
        EXECUTE r.drop_statement;
    END LOOP;
END $$;

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
    v_tutor_allows_same_day boolean := false;
    v_hours_until_session numeric;
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

    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, false) INTO v_tutor_allows_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Calculate hours until session starts
    v_hours_until_session := EXTRACT(EPOCH FROM (p_requested_start_at - now())) / 3600;

    -- Enforce 24-hour advance notice unless tutor allows same-day bookings
    IF NOT v_tutor_allows_same_day AND v_hours_until_session < 24 THEN
        RAISE EXCEPTION 'Bookings must be made at least 24 hours in advance. Please select a time at least one day from now.';
    END IF;

    -- Prevent booking sessions in the past
    IF p_requested_start_at <= now() THEN
        RAISE EXCEPTION 'Cannot book sessions in the past. Please select a future time.';
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

GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- Verification queries
SELECT 
    'Column added' as status,
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'allow_same_day_bookings'
    ) as column_exists;

SELECT 
    'Test user enabled' as status,
    full_name,
    email,
    username,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';
