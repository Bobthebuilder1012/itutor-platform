-- =====================================================
-- FIX: CONFIRMED BOOKINGS MISSING confirmed_start_at/confirmed_end_at
-- =====================================================
-- Root cause: tutor_confirm_booking sets confirmed times but might be missing
-- This prevents the trigger from creating sessions

-- 1. Check the issue
SELECT 
    'Confirmed bookings missing confirmed times:' AS issue,
    COUNT(*) AS count
FROM bookings
WHERE status = 'CONFIRMED'
    AND (confirmed_start_at IS NULL OR confirmed_end_at IS NULL);

-- 2. Fix existing confirmed bookings that are missing confirmed times
UPDATE bookings
SET 
    confirmed_start_at = requested_start_at,
    confirmed_end_at = requested_end_at
WHERE status = 'CONFIRMED'
    AND (confirmed_start_at IS NULL OR confirmed_end_at IS NULL);

-- 3. Show what was fixed
SELECT 
    'Fixed bookings:' AS status,
    COUNT(*) AS count
FROM bookings
WHERE status = 'CONFIRMED'
    AND confirmed_start_at IS NOT NULL
    AND confirmed_end_at IS NOT NULL;

-- 4. Now run the session creation for these fixed bookings
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
            AND b.confirmed_start_at IS NOT NULL
            AND b.confirmed_end_at IS NOT NULL
            AND s.id IS NULL
        ORDER BY b.created_at
    LOOP
        BEGIN
            v_session_id := create_session_from_booking_internal(v_booking.id);
            v_count := v_count + 1;
            RAISE NOTICE '✅ Created session for booking %', v_booking.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '❌ Failed for booking %: %', v_booking.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Created % sessions', v_count;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- 5. Verify all confirmed bookings now have sessions
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All confirmed bookings have sessions!'
        ELSE '⚠️ ' || COUNT(*)::text || ' confirmed bookings still missing sessions'
    END AS final_status
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL;
