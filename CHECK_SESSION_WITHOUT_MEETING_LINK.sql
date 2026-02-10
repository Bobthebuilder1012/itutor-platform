-- =====================================================
-- CHECK SESSIONS WITHOUT MEETING LINKS
-- =====================================================
-- Find sessions that were created but don't have meeting links

SELECT 
    s.id AS session_id,
    s.booking_id,
    s.status,
    s.provider,
    s.meeting_external_id,
    s.join_url,
    s.created_at,
    s.scheduled_start_at,
    -- Booking info
    b.status AS booking_status,
    -- Tutor info
    t.full_name AS tutor_name,
    -- Student info
    st.full_name AS student_name,
    -- Check how long ago session was created
    EXTRACT(EPOCH FROM (NOW() - s.created_at))/60 AS minutes_since_created
FROM sessions s
INNER JOIN bookings b ON b.id = s.booking_id
INNER JOIN profiles t ON t.id = s.tutor_id
INNER JOIN profiles st ON st.id = s.student_id
WHERE s.join_url IS NULL
    OR s.meeting_external_id IS NULL
ORDER BY s.created_at DESC;

-- Count summary
SELECT 
    COUNT(*) AS sessions_without_meeting_links,
    COUNT(*) FILTER (WHERE scheduled_start_at > NOW()) AS upcoming_sessions_affected
FROM sessions
WHERE join_url IS NULL OR meeting_external_id IS NULL;
