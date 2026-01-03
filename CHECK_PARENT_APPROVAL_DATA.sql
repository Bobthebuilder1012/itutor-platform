-- =====================================================
-- CHECK PARENT APPROVAL DATA
-- =====================================================
-- Run this to debug why bookings aren't showing up

-- STEP 1: Check parent-child links
SELECT 
    'Parent-Child Links' AS check_name,
    pcl.id,
    pcl.parent_id,
    pcl.child_id,
    p_parent.full_name AS parent_name,
    p_child.full_name AS child_name,
    p_child.billing_mode
FROM parent_child_links pcl
LEFT JOIN profiles p_parent ON p_parent.id = pcl.parent_id
LEFT JOIN profiles p_child ON p_child.id = pcl.child_id
ORDER BY pcl.created_at DESC
LIMIT 10;

-- STEP 2: Check bookings with PENDING_PARENT_APPROVAL status
SELECT 
    'Bookings Pending Parent Approval' AS check_name,
    b.id AS booking_id,
    b.student_id,
    b.tutor_id,
    b.status,
    b.created_at,
    b.duration_minutes,
    b.price_ttd,
    p_student.full_name AS student_name,
    p_student.billing_mode,
    p_tutor.full_name AS tutor_name
FROM bookings b
LEFT JOIN profiles p_student ON p_student.id = b.student_id
LEFT JOIN profiles p_tutor ON p_tutor.id = b.tutor_id
WHERE b.status = 'PENDING_PARENT_APPROVAL'
ORDER BY b.created_at DESC
LIMIT 10;

-- STEP 3: Check ALL recent bookings (to see what status they have)
SELECT 
    'All Recent Bookings' AS check_name,
    b.id AS booking_id,
    b.student_id,
    b.status,
    b.created_at,
    p_student.full_name AS student_name,
    p_student.billing_mode,
    p_student.role
FROM bookings b
LEFT JOIN profiles p_student ON p_student.id = b.student_id
ORDER BY b.created_at DESC
LIMIT 20;

-- STEP 4: Check notifications for parents
SELECT 
    'Parent Notifications' AS check_name,
    n.id,
    n.user_id AS parent_id,
    n.type,
    n.title,
    n.message,
    n.created_at,
    p.full_name AS parent_name
FROM notifications n
LEFT JOIN profiles p ON p.id = n.user_id
WHERE n.type = 'booking_needs_parent_approval'
ORDER BY n.created_at DESC
LIMIT 10;

-- STEP 5: Check if create_booking_request function exists
SELECT 
    'Function Check' AS check_name,
    proname AS function_name,
    pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'create_booking_request'
LIMIT 1;







