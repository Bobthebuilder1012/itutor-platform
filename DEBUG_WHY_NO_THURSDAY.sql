-- =====================================================
-- DEBUG: Why Thursday slots don't appear
-- =====================================================

-- Get tutor ID first
DO $$
DECLARE
    v_tutor_id uuid;
BEGIN
    SELECT id INTO v_tutor_id FROM profiles WHERE email = 'jovangoodluck@myitutor.com';
    RAISE NOTICE 'Tutor ID: %', v_tutor_id;
END $$;

-- 1. What day of week is Feb 12, 2026?
SELECT 
    '2026-02-12'::date as date,
    EXTRACT(DOW FROM '2026-02-12'::date) as day_of_week_number,
    TO_CHAR('2026-02-12'::date, 'Day') as day_name;

-- 2. Check Thursday availability rule
SELECT 
    'Thursday rule' as check,
    ar.*
FROM tutor_availability_rules ar
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;

-- 3. Manually test slot generation for Thursday Feb 12
WITH test_slots AS (
    SELECT 
        ('2026-02-12' || ' ' || ar.start_time)::timestamp AT TIME ZONE 'America/Port_of_Spain' as window_start,
        ('2026-02-12' || ' ' || ar.end_time)::timestamp AT TIME ZONE 'America/Port_of_Spain' as window_end,
        ar.slot_minutes,
        ar.buffer_minutes
    FROM tutor_availability_rules ar
    WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
    AND day_of_week = 4
    AND is_active = true
)
SELECT 
    'Manual slot generation test' as check,
    window_start,
    window_end,
    slot_minutes,
    buffer_minutes,
    window_start + (0 * (slot_minutes + buffer_minutes) * interval '1 minute') as first_slot,
    window_start + (1 * (slot_minutes + buffer_minutes) * interval '1 minute') as second_slot,
    now() as current_time,
    now() + interval '1 hour' as minimum_time
FROM test_slots;

-- 4. Check if there are any unavailability blocks on Thursday
SELECT 
    'Unavailability blocks' as check,
    start_at,
    end_at
FROM tutor_unavailability_blocks
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND (start_at::date = '2026-02-12' OR end_at::date = '2026-02-12');

-- 5. Check if there are confirmed bookings on Thursday
SELECT 
    'Confirmed bookings' as check,
    confirmed_start_at,
    confirmed_end_at,
    status
FROM bookings
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND confirmed_start_at::date = '2026-02-12'
AND status = 'CONFIRMED';

-- 6. Call the actual function and see what it returns for Thursday
SELECT get_tutor_public_calendar(
    (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
    '2026-02-12 00:00:00-04:00'::timestamptz,
    '2026-02-12 23:59:59-04:00'::timestamptz
) as thursday_calendar;

-- 7. Check what's in the current week Feb 8-14
SELECT get_tutor_public_calendar(
    (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
    '2026-02-08 00:00:00-04:00'::timestamptz,
    '2026-02-14 23:59:59-04:00'::timestamptz
) as full_week_calendar;
