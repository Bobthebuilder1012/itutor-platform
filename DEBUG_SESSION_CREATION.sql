-- =====================================================
-- DEBUG SPECIFIC SESSION CREATION ISSUE
-- =====================================================
-- Find the specific booking that was confirmed but has no session

-- 1. Find recent confirmed bookings without sessions
SELECT 
    b.id AS booking_id,
    b.status,
    b.confirmed_start_at,
    b.confirmed_end_at,
    b.price_ttd,
    b.created_at AS booking_created,
    b.updated_at AS booking_updated,
    -- Tutor info
    t.full_name AS tutor_name,
    t.email AS tutor_email,
    -- Student info
    s.full_name AS student_name,
    -- Video provider info
    vp.provider,
    vp.connection_status,
    vp.is_active AS provider_active,
    -- Session info
    sess.id AS session_id,
    sess.status AS session_status,
    sess.meeting_external_id,
    sess.join_url
FROM bookings b
INNER JOIN profiles t ON t.id = b.tutor_id
INNER JOIN profiles s ON s.id = b.student_id
LEFT JOIN tutor_video_provider_connections vp ON vp.tutor_id = b.tutor_id
LEFT JOIN sessions sess ON sess.booking_id = b.id
WHERE b.status = 'CONFIRMED'
ORDER BY b.updated_at DESC
LIMIT 10;

-- 2. Check if there's a session without a meeting URL (API might have failed)
SELECT 
    s.id,
    s.booking_id,
    s.status,
    s.provider,
    s.meeting_external_id,
    s.join_url,
    s.meeting_created_at,
    s.created_at,
    b.confirmed_start_at AS booking_time
FROM sessions s
INNER JOIN bookings b ON b.id = s.booking_id
WHERE s.meeting_external_id IS NULL 
    OR s.join_url IS NULL
ORDER BY s.created_at DESC
LIMIT 10;

-- 3. Find the most recent booking update
SELECT 
    id,
    status,
    tutor_id,
    student_id,
    updated_at,
    confirmed_start_at
FROM bookings
ORDER BY updated_at DESC
LIMIT 5;
