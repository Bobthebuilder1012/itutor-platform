-- =====================================================
-- DIRECT TEST: Call calendar function and see results
-- =====================================================

-- Test 1: Get Thursday Feb 12 slots directly
SELECT 
    'Thursday Feb 12 Calendar' as test,
    get_tutor_public_calendar(
        (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
        '2026-02-12 00:00:00-04:00'::timestamptz,
        '2026-02-12 23:59:59-04:00'::timestamptz
    );

-- Test 2: Get Monday Feb 9 slots (this one works)
SELECT 
    'Monday Feb 9 Calendar' as test,
    get_tutor_public_calendar(
        (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
        '2026-02-09 00:00:00-04:00'::timestamptz,
        '2026-02-09 23:59:59-04:00'::timestamptz
    );

-- Test 3: Check if there's a time issue with Thursday slots being in the past
SELECT 
    'Time comparison' as test,
    now() as current_time,
    '2026-02-12 09:00:00'::timestamp AT TIME ZONE 'America/Port_of_Spain' as thursday_9am,
    '2026-02-12 12:00:00'::timestamp AT TIME ZONE 'America/Port_of_Spain' as thursday_noon,
    CASE 
        WHEN '2026-02-12 09:00:00'::timestamp AT TIME ZONE 'America/Port_of_Spain' > now() + interval '1 hour'
        THEN '✅ Thursday 9 AM is more than 1 hour away'
        ELSE '❌ Thursday 9 AM is too soon or in the past'
    END as time_check;

-- Test 4: Check which version of get_tutor_public_calendar is currently deployed
SELECT 
    prosrc
FROM pg_proc 
WHERE proname = 'get_tutor_public_calendar'
LIMIT 1;
