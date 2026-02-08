-- =====================================================
-- DIAGNOSE WHY TRIGGER ISN'T CREATING SESSIONS
-- =====================================================

-- 1. Check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_auto_create_session_on_confirm';

-- 2. Check if the function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_name IN ('auto_create_session_on_confirm', 'create_session_from_booking_internal');

-- 3. Check confirmed bookings and their confirmed_start_at/confirmed_end_at
SELECT 
    b.id,
    b.status,
    b.confirmed_start_at,
    b.confirmed_end_at,
    b.requested_start_at,
    b.requested_end_at,
    b.created_at,
    b.updated_at,
    -- Check if session exists
    s.id AS session_id
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
ORDER BY b.updated_at DESC
LIMIT 10;

-- 4. Check if bookings have NULL confirmed times (this would cause trigger to skip)
SELECT 
    COUNT(*) AS bookings_with_null_confirmed_times,
    'These bookings are CONFIRMED but missing confirmed_start_at or confirmed_end_at' AS issue
FROM bookings
WHERE status = 'CONFIRMED'
    AND (confirmed_start_at IS NULL OR confirmed_end_at IS NULL);

-- 5. Manually test the function on one booking
-- Get the first confirmed booking without a session
DO $$
DECLARE
    v_booking_id UUID;
    v_session_id UUID;
BEGIN
    SELECT b.id INTO v_booking_id
    FROM bookings b
    LEFT JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED'
        AND s.id IS NULL
        AND b.confirmed_start_at IS NOT NULL
        AND b.confirmed_end_at IS NOT NULL
    LIMIT 1;

    IF v_booking_id IS NULL THEN
        RAISE NOTICE 'No confirmed bookings found without sessions that have confirmed times';
        RETURN;
    END IF;

    RAISE NOTICE 'Testing function on booking: %', v_booking_id;
    
    BEGIN
        v_session_id := create_session_from_booking_internal(v_booking_id);
        RAISE NOTICE '✅ Successfully created session: %', v_session_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '❌ Failed to create session: %', SQLERRM;
    END;
END $$;

-- 6. Check PostgreSQL logs for any errors
-- Note: This might not work depending on permissions
SELECT * FROM pg_stat_activity WHERE state = 'active';
