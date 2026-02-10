-- =====================================================
-- FIX: Update Thursday end time from 12:00 AM to 12:00 PM
-- =====================================================

-- Check current Thursday availability
SELECT 
    'BEFORE fix' as status,
    day_of_week,
    start_time,
    end_time,
    'If end_time is 00:00:00, that is midnight (wrong!)' as note
FROM tutor_availability_rules
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;

-- Fix: Change 12:00 AM (00:00:00) to 12:00 PM (12:00:00)
UPDATE tutor_availability_rules
SET end_time = '12:00:00'::time  -- This is 12:00 PM (noon)
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4
AND end_time = '00:00:00'::time;  -- If it's currently midnight

-- OR if it's something else, just set it to noon regardless
UPDATE tutor_availability_rules
SET end_time = '12:00:00'::time  -- 12:00 PM (noon)
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;

-- Verify the fix
SELECT 
    'AFTER fix' as status,
    day_of_week,
    start_time,
    end_time,
    slot_minutes,
    buffer_minutes,
    is_active,
    'end_time should now be 12:00:00 (noon)' as note
FROM tutor_availability_rules
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
AND day_of_week = 4;
