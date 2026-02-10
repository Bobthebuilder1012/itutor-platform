-- =====================================================
-- CHECK FOR SESSIONS NEEDING URGENT NOTIFICATIONS
-- =====================================================
-- This script helps verify the urgent notification system
-- Run this to see if any sessions starting soon are missing notifications

-- 1) Sessions starting in the next 10 minutes WITHOUT notifications
SELECT 
  s.id as session_id,
  s.scheduled_start_at,
  s.status,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.student_id,
  s.tutor_id,
  p_student.full_name as student_name,
  p_student.username as student_username,
  p_tutor.full_name as tutor_name,
  p_tutor.username as tutor_username,
  CASE 
    WHEN nl.id IS NULL THEN '❌ NO NOTIFICATION SENT'
    ELSE '✅ Notification sent'
  END as notification_status
FROM sessions s
LEFT JOIN profiles p_student ON p_student.id = s.student_id
LEFT JOIN profiles p_tutor ON p_tutor.id = s.tutor_id
LEFT JOIN notifications_log nl 
  ON nl.session_id = s.id 
  AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '10 minutes'
ORDER BY s.scheduled_start_at ASC;

-- 2) Count of sessions by notification status
SELECT 
  COUNT(*) FILTER (WHERE nl.id IS NOT NULL) as notified_sessions,
  COUNT(*) FILTER (WHERE nl.id IS NULL) as unnotified_sessions,
  COUNT(*) as total_upcoming_sessions
FROM sessions s
LEFT JOIN notifications_log nl 
  ON nl.session_id = s.id 
  AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '10 minutes';

-- 3) Push token availability for users with upcoming sessions
SELECT 
  s.id as session_id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.student_id,
  s.tutor_id,
  COUNT(DISTINCT pt_student.id) as student_push_tokens,
  COUNT(DISTINCT pt_tutor.id) as tutor_push_tokens,
  CASE 
    WHEN COUNT(DISTINCT pt_student.id) = 0 THEN '⚠️ Student has no push tokens'
    WHEN COUNT(DISTINCT pt_tutor.id) = 0 THEN '⚠️ Tutor has no push tokens'
    ELSE '✅ Both have push tokens'
  END as token_status
FROM sessions s
LEFT JOIN push_tokens pt_student ON pt_student.user_id = s.student_id
LEFT JOIN push_tokens pt_tutor ON pt_tutor.user_id = s.tutor_id
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '10 minutes'
GROUP BY s.id, s.scheduled_start_at, s.student_id, s.tutor_id
ORDER BY s.scheduled_start_at ASC;

-- 4) Recent notification activity (last hour)
SELECT 
  nl.type,
  COUNT(*) as notifications_sent,
  COUNT(DISTINCT nl.session_id) as unique_sessions,
  COUNT(DISTINCT nl.user_id) as unique_users,
  MIN(nl.sent_at) as first_notification,
  MAX(nl.sent_at) as last_notification
FROM notifications_log nl
WHERE nl.sent_at > now() - interval '1 hour'
  AND nl.type = 'SESSION_REMINDER_10_MIN'
GROUP BY nl.type;

-- 5) Edge Function last run check (if you're seeing no notifications)
-- Check if there are scheduled sessions but no recent notifications
SELECT 
  COUNT(*) as scheduled_sessions_next_hour,
  COUNT(DISTINCT nl.session_id) FILTER (WHERE nl.sent_at > now() - interval '15 minutes') as notifications_last_15min,
  CASE 
    WHEN COUNT(*) > 0 AND COUNT(DISTINCT nl.session_id) FILTER (WHERE nl.sent_at > now() - interval '15 minutes') = 0 
    THEN '⚠️ Edge Function may not be running - no notifications in last 15 minutes despite upcoming sessions'
    WHEN COUNT(*) = 0 
    THEN '✅ No sessions scheduled in next hour'
    ELSE '✅ Edge Function appears to be working'
  END as edge_function_status
FROM sessions s
LEFT JOIN notifications_log nl ON nl.session_id = s.id AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '1 hour';

-- 6) Sessions that should have been notified but weren't (URGENT)
-- These are sessions that already passed the 10-minute mark
SELECT 
  s.id as session_id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.student_id,
  s.tutor_id,
  '🚨 URGENT: Passed 10-minute reminder window' as alert
FROM sessions s
LEFT JOIN notifications_log nl 
  ON nl.session_id = s.id 
  AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()  -- Still in the future
  AND s.scheduled_start_at < now() + interval '10 minutes'  -- Less than 10 minutes away
  AND nl.id IS NULL  -- No notification sent
ORDER BY s.scheduled_start_at ASC;
