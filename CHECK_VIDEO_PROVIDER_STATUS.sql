-- =====================================================
-- Check Video Provider Connection Status
-- =====================================================

-- 1. Check Jovan's video provider connection
SELECT 
    vc.tutor_id,
    p.full_name,
    p.email,
    vc.provider,
    vc.connection_status,
    vc.is_active,
    vc.token_expires_at,
    vc.token_expires_at AT TIME ZONE 'America/Port_of_Spain' as token_expires_local,
    CASE 
        WHEN vc.token_expires_at > now() THEN '✅ Token valid'
        ELSE '❌ Token EXPIRED - Need to reconnect'
    END as token_status,
    EXTRACT(EPOCH FROM (vc.token_expires_at - now())) / 3600 as hours_until_expiry,
    vc.connected_at,
    vc.updated_at
FROM tutor_video_provider_connections vc
JOIN profiles p ON vc.tutor_id = p.id
WHERE p.email = 'jovangoodluck@myitutor.com'
ORDER BY vc.is_active DESC, vc.updated_at DESC;

-- 2. Check sessions that are stuck without join_url
SELECT 
    s.id as session_id,
    s.status,
    s.scheduled_start_at,
    s.scheduled_start_at AT TIME ZONE 'America/Port_of_Spain' as local_time,
    s.provider,
    s.join_url IS NOT NULL as has_join_url,
    s.meeting_external_id IS NOT NULL as has_meeting_id,
    s.meeting_created_at,
    p_tutor.full_name as tutor_name,
    p_tutor.email as tutor_email,
    p_student.full_name as student_name
FROM sessions s
JOIN profiles p_tutor ON s.tutor_id = p_tutor.id
JOIN profiles p_student ON s.student_id = p_student.id
WHERE p_tutor.email = 'jovangoodluck@myitutor.com'
AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
AND s.join_url IS NULL
ORDER BY s.scheduled_start_at DESC;

-- 3. Check all of Jovan's recent bookings and sessions
SELECT 
    b.id as booking_id,
    b.status as booking_status,
    b.confirmed_start_at,
    b.confirmed_start_at AT TIME ZONE 'America/Port_of_Spain' as local_time,
    s.id as session_id,
    s.status as session_status,
    s.provider as session_provider,
    s.join_url IS NOT NULL as has_meeting_link,
    p_student.full_name as student_name
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
JOIN profiles p_tutor ON b.tutor_id = p_tutor.id
JOIN profiles p_student ON b.student_id = p_student.id
WHERE p_tutor.email = 'jovangoodluck@myitutor.com'
AND b.created_at >= now() - interval '7 days'
ORDER BY b.created_at DESC;

-- 4. Check for any error logs or notes in sessions
SELECT 
    s.id,
    s.status,
    s.scheduled_start_at,
    s.provider,
    s.notes,
    s.created_at,
    s.updated_at
FROM sessions s
JOIN profiles p ON s.tutor_id = p.id
WHERE p.email = 'jovangoodluck@myitutor.com'
AND s.created_at >= now() - interval '24 hours'
ORDER BY s.created_at DESC;

-- 5. Quick fix command if token is expired
-- COPY THIS AND RUN IT SEPARATELY IF TOKEN IS EXPIRED:
/*
-- Deactivate old connection so tutor can reconnect
UPDATE tutor_video_provider_connections
SET is_active = false
WHERE tutor_id = (
    SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com'
);

-- Then tell the tutor to:
-- 1. Go to Settings → Video Provider
-- 2. Click "Connect Google Meet" or "Connect Zoom"
-- 3. Complete OAuth flow
-- 4. Try the Retry button again
*/
