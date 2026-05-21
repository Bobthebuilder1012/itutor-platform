-- =====================================================
-- NOTIFICATION SYSTEM DIAGNOSTIC SCRIPT
-- Run this in Supabase SQL Editor to verify setup
-- =====================================================

-- 1. Check if push_tokens table exists and has data
SELECT 
  'Push Tokens Table' as check_name,
  COUNT(*) as total_tokens,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(CASE WHEN platform = 'web' THEN 1 END) as web_tokens,
  COUNT(CASE WHEN platform = 'android' THEN 1 END) as android_tokens,
  COUNT(CASE WHEN platform = 'ios' THEN 1 END) as ios_tokens
FROM push_tokens;

-- 2. Check if notifications_log table exists
SELECT 
  'Notifications Log' as check_name,
  COUNT(*) as total_logs,
  COUNT(DISTINCT user_id) as users_with_logs,
  MAX(sent_at) as last_notification_sent
FROM notifications_log;

-- 3. Check for upcoming sessions needing 10-min reminders
SELECT 
  'Upcoming Sessions (Next 20 mins)' as check_name,
  COUNT(*) as sessions_count,
  MIN(scheduled_start_at) as earliest_session,
  MAX(scheduled_start_at) as latest_session
FROM sessions
WHERE status = 'SCHEDULED'
  AND scheduled_start_at > NOW()
  AND scheduled_start_at <= NOW() + INTERVAL '20 minutes';

-- 4. List specific sessions that should trigger notifications soon
SELECT 
  s.id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - NOW())) / 60 as minutes_until_start,
  s.student_id,
  s.tutor_id,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM notifications_log 
      WHERE session_id = s.id 
        AND type = 'session_reminder_10min'
    ) THEN 'Already Sent'
    ELSE 'Pending'
  END as notification_status
FROM sessions s
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > NOW()
  AND s.scheduled_start_at <= NOW() + INTERVAL '20 minutes'
ORDER BY s.scheduled_start_at ASC
LIMIT 10;

-- 5. Check for users with push tokens who have upcoming sessions
SELECT 
  'Users Ready for Notifications' as check_name,
  COUNT(DISTINCT u.user_id) as users_with_tokens_and_sessions
FROM (
  SELECT DISTINCT student_id as user_id FROM sessions 
  WHERE status = 'SCHEDULED' 
    AND scheduled_start_at > NOW()
    AND scheduled_start_at <= NOW() + INTERVAL '20 minutes'
  UNION
  SELECT DISTINCT tutor_id as user_id FROM sessions 
  WHERE status = 'SCHEDULED' 
    AND scheduled_start_at > NOW()
    AND scheduled_start_at <= NOW() + INTERVAL '20 minutes'
) u
INNER JOIN push_tokens pt ON pt.user_id = u.user_id;

-- 6. Check cron job status (if you have access to cron.job table)
-- This might fail if pg_cron extension is not visible to your role
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'cron' 
    AND tablename = 'job'
  ) THEN
    RAISE NOTICE 'Cron jobs table exists - checking schedule...';
  ELSE
    RAISE NOTICE 'Cannot access cron.job table - check from Supabase Dashboard';
  END IF;
END $$;
