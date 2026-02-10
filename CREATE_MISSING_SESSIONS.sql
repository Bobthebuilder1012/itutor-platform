-- =====================================================
-- CREATE MISSING SESSIONS FOR CONFIRMED BOOKINGS
-- =====================================================
-- This script creates sessions for confirmed bookings that don't have them
-- NOTE: Only run this if tutors have their video providers connected

-- Function to create a session from a booking
CREATE OR REPLACE FUNCTION create_session_from_booking(p_booking_id UUID)
RETURNS UUID AS $$
DECLARE
    v_booking RECORD;
    v_session_id UUID;
    v_provider TEXT;
    v_duration_minutes INTEGER;
    v_no_show_wait INTEGER;
    v_min_payable INTEGER;
    v_platform_fee_pct INTEGER;
    v_platform_fee NUMERIC;
    v_payout NUMERIC;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
        AND status = 'CONFIRMED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found or not confirmed', p_booking_id;
    END IF;

    -- Check if session already exists
    IF EXISTS (SELECT 1 FROM sessions WHERE booking_id = p_booking_id) THEN
        SELECT id INTO v_session_id FROM sessions WHERE booking_id = p_booking_id;
        RAISE NOTICE 'Session already exists for booking %: %', p_booking_id, v_session_id;
        RETURN v_session_id;
    END IF;

    -- Get tutor's video provider (default to google_meet if not connected)
    SELECT provider INTO v_provider
    FROM tutor_video_provider_connections
    WHERE tutor_id = v_booking.tutor_id
        AND is_active = true
        AND connection_status = 'connected'
    LIMIT 1;

    IF v_provider IS NULL THEN
        -- Default to google_meet if no provider is connected
        v_provider := 'google_meet';
        RAISE NOTICE 'No video provider connected for tutor %, defaulting to google_meet', v_booking.tutor_id;
    END IF;

    -- Calculate duration in minutes
    v_duration_minutes := EXTRACT(EPOCH FROM (v_booking.confirmed_end_at - v_booking.confirmed_start_at)) / 60;

    -- Calculate session rules (33% for no-show wait, 66% for min payable)
    v_no_show_wait := FLOOR(v_duration_minutes * 0.33);
    v_min_payable := FLOOR(v_duration_minutes * 0.66);

    -- Calculate platform fee using tiered structure
    IF v_booking.price_ttd < 50 THEN
        v_platform_fee_pct := 10;
    ELSIF v_booking.price_ttd >= 50 AND v_booking.price_ttd < 200 THEN
        v_platform_fee_pct := 15;
    ELSE
        v_platform_fee_pct := 20;
    END IF;

    v_platform_fee := ROUND(v_booking.price_ttd * v_platform_fee_pct / 100.0, 2);
    v_payout := v_booking.price_ttd - v_platform_fee;

    -- Insert session
    INSERT INTO sessions (
        booking_id,
        tutor_id,
        student_id,
        provider,
        scheduled_start_at,
        scheduled_end_at,
        duration_minutes,
        no_show_wait_minutes,
        min_payable_minutes,
        charge_scheduled_at,
        charge_amount_ttd,
        payout_amount_ttd,
        platform_fee_ttd,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_booking_id,
        v_booking.tutor_id,
        v_booking.student_id,
        v_provider,
        v_booking.confirmed_start_at,
        v_booking.confirmed_end_at,
        v_duration_minutes,
        v_no_show_wait,
        v_min_payable,
        v_booking.confirmed_end_at,
        v_booking.price_ttd,
        v_payout,
        v_platform_fee,
        'SCHEDULED',
        NOW(),
        NOW()
    ) RETURNING id INTO v_session_id;

    RAISE NOTICE 'Session % created for booking %', v_session_id, p_booking_id;
    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_session_from_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_session_from_booking TO service_role;

-- Create sessions for all confirmed bookings without sessions
DO $$
DECLARE
    v_booking RECORD;
    v_session_id UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_booking IN 
        SELECT b.id
        FROM bookings b
        LEFT JOIN sessions s ON s.booking_id = b.id
        WHERE b.status = 'CONFIRMED'
            AND s.id IS NULL
        ORDER BY b.created_at
    LOOP
        BEGIN
            v_session_id := create_session_from_booking(v_booking.id);
            v_count := v_count + 1;
            RAISE NOTICE 'Created session % for booking %', v_session_id, v_booking.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create session for booking %: %', v_booking.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Created % sessions for confirmed bookings', v_count;
END $$;

-- Verify results
SELECT 
    COUNT(*) AS remaining_confirmed_bookings_without_sessions
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL;
