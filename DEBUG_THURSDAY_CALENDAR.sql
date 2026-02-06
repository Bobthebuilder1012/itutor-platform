-- =====================================================
-- DEBUG: Why Thursday Feb 12 shows no times
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Check tutor's same-day bookings status
SELECT 
    'Same-day booking status' as check,
    full_name,
    email,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';

-- 2. Check Thursday availability rule
SELECT 
    'Thursday availability rule' as check,
    day_of_week,
    start_time,
    end_time,
    slot_minutes,
    buffer_minutes,
    is_active
FROM tutor_availability_rules
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;  -- Thursday

-- 3. Check for unavailability blocks on Thursday Feb 12, 2026
SELECT 
    'Unavailability blocks for Feb 12' as check,
    start_at,
    end_at,
    reason
FROM tutor_unavailability_blocks
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND start_at::date = '2026-02-12'::date;

-- 4. Check for existing bookings on Thursday Feb 12, 2026
SELECT 
    'Existing bookings for Feb 12' as check,
    status,
    confirmed_start_at,
    confirmed_end_at,
    student_id
FROM bookings
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND confirmed_start_at::date = '2026-02-12'::date
AND status = 'CONFIRMED';

-- 5. Test the calendar function directly for Thursday Feb 12
SELECT 
    'Calendar function test' as check,
    get_tutor_public_calendar(
        (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
        '2026-02-12 00:00:00'::timestamptz,
        '2026-02-12 23:59:59'::timestamptz
    ) as calendar_result;

-- 6. Check current timestamp to ensure it's not a timezone issue
SELECT 
    'Current time check' as check,
    now() as current_time_utc,
    now() AT TIME ZONE 'America/Port_of_Spain' as current_time_trinidad,
    '2026-02-12 09:00:00'::timestamptz as thursday_9am,
    now() + interval '24 hours' as tomorrow_this_time;
