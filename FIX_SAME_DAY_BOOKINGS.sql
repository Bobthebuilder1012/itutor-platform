-- =====================================================
-- FIX: Enable Same-Day Bookings for All Tutors (PERMANENT)
-- =====================================================
-- This allows students to book slots on the same day
-- as long as the slot time hasn't passed yet
--
-- Makes it permanent by:
-- 1. Updating all existing tutors
-- 2. Changing the default for new tutors

-- Step 1: Check current state
SELECT 
    'Current Settings' as check_name,
    COUNT(*) as total_tutors,
    COUNT(*) FILTER (WHERE allow_same_day_bookings = true) as allow_same_day,
    COUNT(*) FILTER (WHERE allow_same_day_bookings = false OR allow_same_day_bookings IS NULL) as require_24h_notice
FROM profiles
WHERE role = 'tutor';

-- Step 2: Change the DEFAULT for future tutors
ALTER TABLE profiles 
ALTER COLUMN allow_same_day_bookings SET DEFAULT true;

-- Step 3: Enable same-day bookings for ALL existing tutors
UPDATE profiles
SET 
    allow_same_day_bookings = true,
    updated_at = NOW()
WHERE role = 'tutor';

-- Step 4: Verify the change
SELECT 
    'After Update' as check_name,
    COUNT(*) as total_tutors,
    COUNT(*) FILTER (WHERE allow_same_day_bookings = true) as allow_same_day,
    COUNT(*) FILTER (WHERE allow_same_day_bookings = false OR allow_same_day_bookings IS NULL) as require_24h_notice
FROM profiles
WHERE role = 'tutor';

-- Step 5: Show some example tutors
SELECT 
    full_name,
    email,
    username,
    allow_same_day_bookings,
    updated_at
FROM profiles
WHERE role = 'tutor'
ORDER BY updated_at DESC
LIMIT 10;

-- Step 6: Verify the new default is set
SELECT 
    column_name,
    column_default,
    data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name = 'allow_same_day_bookings';
