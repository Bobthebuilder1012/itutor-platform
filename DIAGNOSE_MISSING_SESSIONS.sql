-- =====================================================
-- DIAGNOSE MISSING SESSIONS FOR CONFIRMED BOOKINGS
-- =====================================================

-- Find all confirmed bookings that don't have sessions
SELECT 
    b.id AS booking_id,
    b.status,
    b.student_id,
    b.tutor_id,
    b.confirmed_start_at,
    b.confirmed_end_at,
    b.price_ttd,
    b.created_at AS booking_created_at,
    -- Check if session exists
    s.id AS session_id,
    s.status AS session_status,
    -- Check if tutor has video provider
    vp.provider AS video_provider,
    vp.connection_status AS provider_status,
    vp.is_active AS provider_active
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
LEFT JOIN tutor_video_provider_connections vp ON vp.tutor_id = b.tutor_id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL  -- No session exists
ORDER BY b.created_at DESC;

-- Summary: How many confirmed bookings are missing sessions?
SELECT 
    COUNT(*) AS confirmed_bookings_without_sessions
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL;

-- Check tutors who confirmed bookings but don't have video providers
SELECT DISTINCT
    b.tutor_id,
    p.full_name AS tutor_name,
    p.email AS tutor_email,
    COUNT(b.id) AS confirmed_bookings_without_sessions
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
LEFT JOIN tutor_video_provider_connections vp ON vp.tutor_id = b.tutor_id
LEFT JOIN profiles p ON p.id = b.tutor_id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL
    AND (vp.id IS NULL OR vp.is_active = false OR vp.connection_status != 'connected')
GROUP BY b.tutor_id, p.full_name, p.email
ORDER BY confirmed_bookings_without_sessions DESC;
