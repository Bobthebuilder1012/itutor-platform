-- Debug script to check why parent isn't seeing children's sessions

-- First, find the parent and their children
SELECT 
    'Parent-Child Links' as check_type,
    parent_id,
    child_id,
    child_color
FROM parent_child_links
WHERE parent_id = 'YOUR_PARENT_ID';  -- Replace with actual parent ID

-- Check if children have any sessions at all
SELECT 
    'All Sessions for Children' as check_type,
    s.id,
    s.student_id,
    s.tutor_id,
    s.status,
    s.scheduled_start_at,
    s.scheduled_end_at,
    s.booking_id
FROM sessions s
WHERE s.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = 'YOUR_PARENT_ID'  -- Replace with actual parent ID
);

-- Check upcoming sessions specifically
SELECT 
    'Upcoming Sessions' as check_type,
    s.id,
    s.student_id,
    s.status,
    s.scheduled_start_at,
    s.booking_id,
    b.subject_id
FROM sessions s
LEFT JOIN bookings b ON s.booking_id = b.id
WHERE s.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = 'YOUR_PARENT_ID'  -- Replace with actual parent ID
)
AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
AND s.scheduled_start_at >= NOW();

-- Check RLS policies on sessions table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'sessions';

-- Check if sessions exist at all
SELECT 
    'Total Sessions Count' as check_type,
    COUNT(*) as total_sessions
FROM sessions;

-- Check bookings for the children
SELECT 
    'Bookings for Children' as check_type,
    b.id,
    b.student_id,
    b.status,
    b.confirmed_start_at,
    b.subject_id
FROM bookings b
WHERE b.student_id IN (
    SELECT child_id 
    FROM parent_child_links 
    WHERE parent_id = 'YOUR_PARENT_ID'  -- Replace with actual parent ID
)
AND b.status = 'CONFIRMED';







