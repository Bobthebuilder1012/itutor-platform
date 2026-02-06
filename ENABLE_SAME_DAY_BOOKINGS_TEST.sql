-- =====================================================
-- QUICK ENABLE: Same-Day Bookings for Test User
-- Run this in Supabase SQL Editor for immediate effect
-- =====================================================

-- Add column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allow_same_day_bookings boolean DEFAULT false;

-- Enable for specific user
UPDATE public.profiles
SET allow_same_day_bookings = true
WHERE email = 'jovangoodluck@myitutor.com'
AND role = 'tutor';

-- Verify it worked
SELECT 
    full_name,
    email,
    username,
    role,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';
