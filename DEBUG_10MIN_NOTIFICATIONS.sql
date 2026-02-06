-- =====================================================
-- Debug 10-Minute Session Reminder Notifications
-- =====================================================

-- 1. Check if there are upcoming sessions in the next 10 minutes
SELECT 
    s.id,
    s.status,
    s.scheduled_start_at,
    s.scheduled_start_at AT TIME ZONE 'America/Port_of_Spain' as local_time,
    EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_session,
    p_student.full_name as student_name,
    p_student.email as student_email,
    p_tutor.full_name as tutor_name,
    p_tutor.email as tutor_email
FROM sessions s
JOIN profiles p_student ON s.student_id = p_student.id
JOIN profiles p_tutor ON s.tutor_id = p_tutor.id
WHERE s.status = 'SCHEDULED'
AND s.scheduled_start_at >= now() + interval '5 minutes'
AND s.scheduled_start_at <= now() + interval '15 minutes'
ORDER BY s.scheduled_start_at;

-- 2. Check if push tokens are registered for these users
SELECT 
    pt.user_id,
    p.full_name,
    p.email,
    pt.platform,
    pt.created_at as token_created,
    pt.last_used_at as token_last_used,
    CASE 
        WHEN pt.token IS NOT NULL THEN '✅ Has token'
        ELSE '❌ No token'
    END as token_status
FROM push_tokens pt
JOIN profiles p ON pt.user_id = p.id
WHERE pt.user_id IN (
    SELECT student_id FROM sessions WHERE status = 'SCHEDULED' 
    AND scheduled_start_at >= now() + interval '5 minutes'
    AND scheduled_start_at <= now() + interval '15 minutes'
    UNION
    SELECT tutor_id FROM sessions WHERE status = 'SCHEDULED'
    AND scheduled_start_at >= now() + interval '5 minutes'
    AND scheduled_start_at <= now() + interval '15 minutes'
)
ORDER BY p.full_name;

-- 3. Check notifications_log to see if notifications were already sent
SELECT 
    nl.user_id,
    p.full_name,
    nl.session_id,
    nl.type,
    nl.created_at as notification_sent_at,
    s.scheduled_start_at
FROM notifications_log nl
JOIN profiles p ON nl.user_id = p.id
LEFT JOIN sessions s ON nl.session_id = s.id
WHERE nl.type = 'session_reminder_10_min'
AND nl.created_at >= now() - interval '1 day'
ORDER BY nl.created_at DESC;

-- 4. Check if the notifications table has any recent entries
SELECT 
    n.user_id,
    p.full_name,
    n.type,
    n.title,
    n.message,
    n.created_at,
    n.read_at
FROM notifications n
JOIN profiles p ON n.user_id = p.id
WHERE n.type = 'session_reminder_10_min'
AND n.created_at >= now() - interval '1 day'
ORDER BY n.created_at DESC;

-- 5. Check FCM environment variables setup (for admins)
-- This needs to be run in Supabase Edge Functions settings
-- SELECT 
--     name,
--     CASE 
--         WHEN value IS NOT NULL AND value != '' THEN '✅ Set'
--         ELSE '❌ Missing'
--     END as status
-- FROM edge_function_secrets
-- WHERE name IN ('FCM_SERVICE_ACCOUNT_JSON', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');

-- 6. Summary: Who should get notifications?
SELECT 
    'Expected Recipients' as check_type,
    COUNT(DISTINCT s.student_id) + COUNT(DISTINCT s.tutor_id) as total_users,
    COUNT(*) as sessions_count
FROM sessions s
WHERE s.status = 'SCHEDULED'
AND s.scheduled_start_at >= now() + interval '9 minutes'
AND s.scheduled_start_at <= now() + interval '11 minutes';

-- 7. Check if Edge Function is deployed
-- Run this query: 
-- SELECT * FROM pg_catalog.pg_extension WHERE extname = 'pg_cron';
