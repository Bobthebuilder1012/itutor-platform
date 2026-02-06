-- =====================================================
-- QUICK FIX: Add Thursday availability for JovanMR
-- Run this if tutor has no availability rules set up
-- =====================================================

-- Add Thursday availability (9 AM - 5 PM, 60-minute slots, 15-minute buffer)
INSERT INTO tutor_availability_rules (
    tutor_id,
    day_of_week,
    start_time,
    end_time,
    slot_minutes,
    buffer_minutes,
    is_active
)
SELECT 
    id,
    4,  -- Thursday
    '09:00:00'::time,
    '17:00:00'::time,
    60,  -- 1-hour slots
    15,  -- 15-min buffer
    true
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com'
AND NOT EXISTS (
    -- Don't duplicate if already exists
    SELECT 1 FROM tutor_availability_rules
    WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
    AND day_of_week = 4
);

-- Verify it was added
SELECT 
    p.full_name,
    p.email,
    ar.day_of_week,
    ar.start_time,
    ar.end_time,
    ar.slot_minutes,
    ar.buffer_minutes,
    ar.is_active,
    CASE ar.day_of_week
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
    END as day_name
FROM profiles p
JOIN tutor_availability_rules ar ON ar.tutor_id = p.id
WHERE p.email = 'jovangoodluck@myitutor.com'
ORDER BY ar.day_of_week;
