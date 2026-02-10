-- =====================================================
-- TRIGGER MEETING CREATION FOR SESSIONS WITHOUT LINKS
-- =====================================================
-- This finds all sessions without meeting links and logs them
-- The actual meeting creation needs to happen via the API

-- Find sessions that need meeting links created
SELECT 
    s.id AS session_id,
    s.booking_id,
    s.tutor_id,
    s.student_id,
    s.provider,
    s.scheduled_start_at,
    s.join_url,
    s.meeting_external_id,
    t.full_name AS tutor_name,
    t.email AS tutor_email
FROM sessions s
INNER JOIN profiles t ON t.id = s.tutor_id
WHERE (s.join_url IS NULL OR s.meeting_external_id IS NULL)
    AND s.scheduled_start_at > NOW()  -- Only upcoming sessions
ORDER BY s.scheduled_start_at;

-- Show count
SELECT 
    COUNT(*) AS sessions_needing_meeting_links
FROM sessions
WHERE (join_url IS NULL OR meeting_external_id IS NULL)
    AND scheduled_start_at > NOW();
