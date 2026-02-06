-- =====================================================
-- Find sessions stuck without meeting links
-- =====================================================

-- 1. Check which sessions are missing join_url
SELECT 
    s.id as session_id,
    s.status,
    s.scheduled_start_at,
    s.provider,
    s.tutor_id,
    t.full_name as tutor_name,
    t.email as tutor_email,
    CASE 
        WHEN s.join_url IS NULL THEN '❌ Missing'
        ELSE '✅ Has link'
    END as link_status,
    vc.connection_status as video_connection_status,
    vc.provider as connected_provider
FROM sessions s
JOIN profiles t ON s.tutor_id = t.id
LEFT JOIN tutor_video_provider_connections vc ON s.tutor_id = vc.tutor_id AND vc.is_active = true
WHERE s.status IN ('SCHEDULED', 'JOIN_OPEN')
AND s.join_url IS NULL
ORDER BY s.scheduled_start_at DESC;

-- 2. Check if tutors have valid video connections
SELECT 
    tutor_id,
    provider,
    connection_status,
    is_active,
    token_expires_at,
    CASE 
        WHEN token_expires_at > now() THEN '✅ Token valid'
        ELSE '⚠️ Token expired'
    END as token_status,
    updated_at
FROM tutor_video_provider_connections
WHERE tutor_id IN (
    SELECT DISTINCT tutor_id 
    FROM sessions 
    WHERE status IN ('SCHEDULED', 'JOIN_OPEN')
    AND join_url IS NULL
)
ORDER BY tutor_id;
