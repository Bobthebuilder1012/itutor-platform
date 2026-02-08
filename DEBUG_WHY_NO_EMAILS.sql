-- =====================================================
-- DEBUG: Why Aren't Emails Being Sent?
-- =====================================================
-- Run this to see what's blocking email delivery

-- 1. Check if the new user was queued
SELECT 
  '1. Recent Queue Entries (last hour)' as check_section;

SELECT 
  q.id,
  p.email,
  p.full_name,
  q.user_type,
  q.stage,
  q.next_send_at,
  q.is_active,
  q.last_sent_at,
  q.created_at,
  CASE 
    WHEN q.next_send_at > NOW() THEN '⏳ Scheduled for future'
    WHEN q.next_send_at <= NOW() AND q.is_active AND q.last_sent_at IS NULL THEN '🔴 SHOULD BE SENDING NOW!'
    WHEN q.last_sent_at IS NOT NULL THEN '✅ Already sent'
    WHEN NOT q.is_active THEN '❌ Inactive'
  END as status
FROM onboarding_email_queue q
JOIN profiles p ON p.id = q.user_id
WHERE q.created_at > NOW() - INTERVAL '1 hour'
ORDER BY q.created_at DESC;

-- 2. Check for overdue emails that should have been sent
SELECT 
  '2. Overdue Emails (should be sending)' as check_section;

SELECT 
  COUNT(*) as overdue_count,
  MIN(next_send_at) as oldest_overdue,
  MAX(next_send_at) as newest_overdue
FROM onboarding_email_queue
WHERE is_active = true 
  AND next_send_at <= NOW()
  AND (last_sent_at IS NULL OR last_sent_at < next_send_at);

-- 3. Check recent email send logs
SELECT 
  '3. Recent Email Send Attempts (last hour)' as check_section;

SELECT 
  created_at,
  recipient_email,
  email_type,
  subject,
  status,
  error_message
FROM email_send_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 4. Check if email templates exist
SELECT 
  '4. Email Templates Status' as check_section;

SELECT 
  user_type,
  name,
  subject,
  CASE WHEN html_content IS NOT NULL THEN '✅ Ready' ELSE '❌ Missing' END as status,
  LENGTH(html_content) as content_length
FROM email_templates
WHERE user_type IN ('student', 'tutor', 'parent')
  AND name ILIKE '%welcome%'
ORDER BY user_type;

-- 5. Show the actual overdue entries that need to be sent
SELECT 
  '5. Emails That Should Send NOW' as check_section;

SELECT 
  q.id as queue_id,
  p.email,
  p.full_name,
  q.user_type,
  q.stage,
  q.next_send_at,
  q.last_sent_at,
  AGE(NOW(), q.next_send_at) as overdue_by,
  p.created_at as user_signup_time
FROM onboarding_email_queue q
JOIN profiles p ON p.id = q.user_id
WHERE q.is_active = true 
  AND q.next_send_at <= NOW()
  AND (q.last_sent_at IS NULL OR q.last_sent_at < q.next_send_at)
ORDER BY q.next_send_at ASC
LIMIT 10;

-- 6. Check trigger is active
SELECT 
  '6. Trigger Status' as check_section;

SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  '✅ Active' as status
FROM information_schema.triggers
WHERE trigger_name = 'auto_queue_onboarding_on_signup';

-- 7. Summary
SELECT 
  '7. DIAGNOSIS' as check_section;

SELECT 
  CASE 
    -- No queue entries at all
    WHEN NOT EXISTS (SELECT 1 FROM onboarding_email_queue WHERE created_at > NOW() - INTERVAL '1 hour')
    THEN '🔴 PROBLEM: New user did not get queued - trigger may not be working'
    
    -- Queue entry exists but no template
    WHEN NOT EXISTS (SELECT 1 FROM email_templates WHERE user_type = 'student' AND name ILIKE '%welcome%')
    THEN '🔴 PROBLEM: Email templates are missing from database'
    
    -- Overdue emails exist but no send logs
    WHEN EXISTS (
      SELECT 1 FROM onboarding_email_queue 
      WHERE is_active = true AND next_send_at <= NOW() - INTERVAL '15 minutes'
    )
    AND NOT EXISTS (
      SELECT 1 FROM email_send_logs 
      WHERE created_at > NOW() - INTERVAL '30 minutes'
    )
    THEN '🔴 PROBLEM: Cron job is NOT running - emails are queued but not being sent'
    
    -- Send attempts but all failed
    WHEN EXISTS (
      SELECT 1 FROM email_send_logs 
      WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'failed'
    )
    THEN '🔴 PROBLEM: Email sending is failing - check error messages above'
    
    ELSE '✅ Check individual sections above for details'
  END as diagnosis;
