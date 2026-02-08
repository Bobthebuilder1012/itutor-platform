-- =====================================================
-- MANUALLY CREATE SESSION FOR SPECIFIC BOOKING
-- =====================================================
-- Use this to manually create a session for a specific booking ID
-- Replace '<booking-id>' with the actual booking ID

-- First, find the booking you want to create a session for:
SELECT 
    b.id,
    b.status,
    b.tutor_id,
    b.student_id,
    b.confirmed_start_at,
    b.confirmed_end_at,
    b.price_ttd,
    t.full_name AS tutor_name,
    s.full_name AS student_name,
    vp.provider AS video_provider
FROM bookings b
INNER JOIN profiles t ON t.id = b.tutor_id
INNER JOIN profiles s ON s.id = b.student_id
LEFT JOIN tutor_video_provider_connections vp ON vp.tutor_id = b.tutor_id
WHERE b.status = 'CONFIRMED'
    AND NOT EXISTS (SELECT 1 FROM sessions WHERE booking_id = b.id)
ORDER BY b.updated_at DESC;

-- Once you identify the booking, use this function to create the session:
-- SELECT create_session_from_booking('<booking-id>');

-- Example (uncomment and replace with actual booking ID):
-- SELECT create_session_from_booking('85bd0dea-e6e4-4046-94e9-85ba198c2229');

-- To create sessions for ALL confirmed bookings without sessions, run:
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
            -- Call the function from CREATE_MISSING_SESSIONS.sql
            v_session_id := create_session_from_booking(v_booking.id);
            v_count := v_count + 1;
            RAISE NOTICE '✅ Created session % for booking %', v_session_id, v_booking.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '❌ Failed to create session for booking %: %', v_booking.id, SQLERRM;
        END;
    END LOOP;

    IF v_count = 0 THEN
        RAISE NOTICE 'ℹ️  No confirmed bookings found without sessions';
    ELSE
        RAISE NOTICE '✅ Created % sessions for confirmed bookings', v_count;
    END IF;
END $$;
