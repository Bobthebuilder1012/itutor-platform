-- Fix tutor_confirm_booking function overloading conflict
-- This removes all versions and creates a single clean version

-- Drop ALL existing versions of tutor_confirm_booking
DROP FUNCTION IF EXISTS public.tutor_confirm_booking(uuid);
DROP FUNCTION IF EXISTS public.tutor_confirm_booking(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.tutor_confirm_booking(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.tutor_confirm_booking(uuid, timestamptz, timestamptz, text);

-- Create the definitive version with optional parameters
CREATE OR REPLACE FUNCTION public.tutor_confirm_booking(
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
    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE tutor_id = v_booking.tutor_id
        AND id != p_booking_id
        AND status = 'CONFIRMED'
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_confirmed_start_at, p_confirmed_end_at)
    ) THEN
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
        'duration_minutes', v_duration_minutes,
        'status', 'CONFIRMED'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.tutor_confirm_booking TO authenticated;

-- Done! The function is now fixed and ready to use.

