-- =====================================================
-- QUICK FIX: Ensure Thursday slots appear
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Update Thursday availability to have reasonable buffer
UPDATE tutor_availability_rules
SET 
    buffer_minutes = 0,  -- Remove buffer to maximize slots
    slot_minutes = 60,   -- Standard 1-hour slots
    end_time = '17:00:00'::time  -- Extend to 5 PM
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;  -- Thursday

-- Step 2: Verify the update
SELECT 
    'Updated Thursday availability' as result,
    day_of_week,
    start_time,
    end_time,
    slot_minutes,
    buffer_minutes,
    is_active
FROM tutor_availability_rules
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;

-- Step 3: Test calendar generation for Thursday
SELECT get_tutor_public_calendar(
    (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'),
    '2026-02-12 00:00:00'::timestamptz,
    '2026-02-12 23:59:59'::timestamptz
);
