-- =====================================================
-- CHECK: Which confirmed bookings are missing sessions?
-- =====================================================

-- Find confirmed bookings without sessions
SELECT 
    b.id as booking_id,
    b.status as booking_status,
    b.confirmed_start_at,
    b.confirmed_end_at,
    t.full_name as tutor_name,
    s.full_name as student_name,
    CASE 
        WHEN sess.id IS NULL THEN '❌ NO SESSION'
        ELSE '✅ HAS SESSION'
    END as session_status,
    sess.id as session_id,
    sess.status as session_status_value
FROM bookings b
INNER JOIN profiles t ON t.id = b.tutor_id
INNER JOIN profiles s ON s.id = b.student_id
LEFT JOIN sessions sess ON sess.booking_id = b.id
WHERE b.status = 'CONFIRMED'
ORDER BY b.created_at DESC;

-- Summary
SELECT 
    COUNT(*) FILTER (WHERE sess.id IS NOT NULL) as bookings_with_sessions,
    COUNT(*) FILTER (WHERE sess.id IS NULL) as bookings_without_sessions,
    COUNT(*) as total_confirmed_bookings
FROM bookings b
LEFT JOIN sessions sess ON sess.booking_id = b.id
WHERE b.status = 'CONFIRMED';
