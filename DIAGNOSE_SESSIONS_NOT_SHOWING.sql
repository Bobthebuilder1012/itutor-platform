-- =====================================================
-- DIAGNOSE WHY SESSIONS AREN'T SHOWING
-- =====================================================
-- Run this in Supabase SQL Editor to check your sessions

-- Replace 'YOUR_USER_ID' with your actual user ID
-- You can get it from the profiles table or from browser console: supabase.auth.getUser()

-- 1. Check ALL sessions for your student account
SELECT 
    'All Your Sessions' as check_name,
    s.id,
    s.scheduled_start_at,
    s.status as session_status,
    CASE 
        WHEN s.scheduled_start_at < NOW() THEN '⚠️ PAST SESSION'
        ELSE '✅ UPCOMING SESSION'
    END as timing,
    b.status as booking_status,
    p.full_name as tutor_name
FROM sessions s
LEFT JOIN bookings b ON s.booking_id = b.id
LEFT JOIN profiles p ON s.tutor_id = p.id
WHERE s.student_id = 'YOUR_USER_ID'  -- <-- REPLACE WITH YOUR USER ID
ORDER BY s.scheduled_start_at DESC;

-- 2. Check why sessions might be filtered out
SELECT 
    'Session Filter Analysis' as check_name,
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN s.scheduled_start_at >= NOW() THEN 1 END) as upcoming_sessions,
    COUNT(CASE WHEN s.scheduled_start_at < NOW() THEN 1 END) as past_sessions,
    COUNT(CASE WHEN s.status IN ('SCHEDULED', 'JOIN_OPEN') THEN 1 END) as valid_status,
    COUNT(CASE WHEN s.status NOT IN ('SCHEDULED', 'JOIN_OPEN') THEN 1 END) as invalid_status,
    COUNT(CASE WHEN b.status IN ('CANCELLED', 'DECLINED') THEN 1 END) as cancelled_bookings,
    COUNT(CASE 
        WHEN s.scheduled_start_at >= NOW() 
        AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
        AND (b.status IS NULL OR b.status NOT IN ('CANCELLED', 'DECLINED'))
        THEN 1 
    END) as should_show
FROM sessions s
LEFT JOIN bookings b ON s.booking_id = b.id
WHERE s.student_id = 'YOUR_USER_ID';  -- <-- REPLACE WITH YOUR USER ID

-- 3. List all possible session statuses you have
SELECT 
    'Your Session Statuses' as check_name,
    s.status,
    COUNT(*) as count,
    MIN(s.scheduled_start_at) as earliest,
    MAX(s.scheduled_start_at) as latest
FROM sessions s
WHERE s.student_id = 'YOUR_USER_ID'  -- <-- REPLACE WITH YOUR USER ID
GROUP BY s.status
ORDER BY count DESC;

-- 4. Check bookings linked to your sessions
SELECT 
    'Your Booking Statuses' as check_name,
    b.status as booking_status,
    COUNT(*) as count
FROM sessions s
LEFT JOIN bookings b ON s.booking_id = b.id
WHERE s.student_id = 'YOUR_USER_ID'  -- <-- REPLACE WITH YOUR USER ID
GROUP BY b.status;

-- 5. Get your user ID if you don't know it
SELECT 
    'Your User ID' as check_name,
    id,
    email,
    full_name,
    role
FROM profiles
WHERE role = 'student'
ORDER BY created_at DESC
LIMIT 10;
