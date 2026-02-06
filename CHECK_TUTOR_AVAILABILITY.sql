-- Check if JovanMR has availability rules set up

-- 1. Check the tutor's allow_same_day_bookings status
SELECT 
    full_name,
    email,
    username,
    allow_same_day_bookings,
    'Tutor settings' as check_type
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';

-- 2. Check if tutor has ANY availability rules
SELECT 
    id,
    day_of_week,
    start_time,
    end_time,
    slot_minutes,
    buffer_minutes,
    is_active,
    'Availability rules' as check_type
FROM tutor_availability_rules
WHERE tutor_id = (
    SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'
);

-- 3. Check specifically for Thursday (day_of_week = 4)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM tutor_availability_rules 
            WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
            AND day_of_week = 4
            AND is_active = true
        ) 
        THEN 'YES - Thursday availability configured'
        ELSE 'NO - No Thursday availability found'
    END as thursday_status;

-- Day of week mapping:
-- 0 = Sunday
-- 1 = Monday
-- 2 = Tuesday
-- 3 = Wednesday
-- 4 = Thursday
-- 5 = Friday
-- 6 = Saturday
