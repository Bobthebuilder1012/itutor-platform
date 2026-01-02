-- COMPLETE DIAGNOSTIC FOR PARENT SESSIONS ISSUE
-- Replace '93e52f14-6af3-446b-bd64-29a2fa11b13f' with the parent's actual ID if different

-- 1. Check parent and children
SELECT 
    '1. Parent-Child Links' as check_step,
    pcl.parent_id,
    pcl.child_id,
    pcl.child_color,
    p.full_name as child_name
FROM parent_child_links pcl
LEFT JOIN profiles p ON p.id = pcl.child_id
WHERE pcl.parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f';

-- 2. Check ALL sessions for these children (ignore filters)
SELECT 
    '2. ALL Sessions (no filters)' as check_step,
    s.id,
    s.student_id,
    p.full_name as student_name,
    s.status,
    s.scheduled_start_at,
    s.booking_id,
    b.subject_id
FROM sessions s
LEFT JOIN profiles p ON p.id = s.student_id
LEFT JOIN bookings b ON b.id = s.booking_id
WHERE s.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f'
)
ORDER BY s.scheduled_start_at DESC;

-- 3. Check upcoming sessions with filters applied
SELECT 
    '3. Upcoming Sessions (with filters)' as check_step,
    s.id,
    s.student_id,
    p.full_name as student_name,
    s.status,
    s.scheduled_start_at,
    NOW() as current_time,
    s.scheduled_start_at >= NOW() as is_future,
    s.booking_id,
    b.subject_id
FROM sessions s
LEFT JOIN profiles p ON p.id = s.student_id
LEFT JOIN bookings b ON b.id = s.booking_id
WHERE s.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f'
)
AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
AND s.scheduled_start_at >= NOW()
ORDER BY s.scheduled_start_at;

-- 4. Check RLS policies on sessions table
SELECT 
    '4. RLS Policies on sessions' as check_step,
    schemaname,
    tablename,
    policyname,
    cmd as operation,
    CASE 
        WHEN cmd = 'SELECT' THEN 'SELECT policy'
        WHEN cmd = 'INSERT' THEN 'INSERT policy'
        WHEN cmd = 'UPDATE' THEN 'UPDATE policy'
        WHEN cmd = 'DELETE' THEN 'DELETE policy'
        ELSE cmd
    END as policy_type
FROM pg_policies 
WHERE tablename = 'sessions'
ORDER BY policyname;

-- 5. Check confirmed bookings (these should have sessions)
SELECT 
    '5. Confirmed Bookings (should have sessions)' as check_step,
    b.id as booking_id,
    b.student_id,
    p.full_name as student_name,
    b.status,
    b.confirmed_start_at,
    b.confirmed_end_at,
    b.subject_id,
    s.id as session_id,
    CASE 
        WHEN s.id IS NULL THEN 'NO SESSION CREATED!'
        ELSE 'Session exists'
    END as session_status
FROM bookings b
LEFT JOIN profiles p ON p.id = b.student_id
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f'
)
AND b.status = 'CONFIRMED'
ORDER BY b.confirmed_start_at DESC;

-- 6. Total counts
SELECT 
    '6. Summary Counts' as check_step,
    (SELECT COUNT(*) FROM parent_child_links WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f') as total_children,
    (SELECT COUNT(*) FROM bookings WHERE student_id IN (SELECT child_id FROM parent_child_links WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f') AND status = 'CONFIRMED') as total_confirmed_bookings,
    (SELECT COUNT(*) FROM sessions WHERE student_id IN (SELECT child_id FROM parent_child_links WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f')) as total_sessions_all_status,
    (SELECT COUNT(*) FROM sessions WHERE student_id IN (SELECT child_id FROM parent_child_links WHERE parent_id = '93e52f14-6af3-446b-bd64-29a2fa11b13f') AND status IN ('SCHEDULED', 'JOIN_OPEN') AND scheduled_start_at >= NOW()) as total_upcoming_sessions;

