-- =====================================================
-- DIAGNOSE: Welcome Email System Status (FIXED)
-- =====================================================
-- Run this to check if the email system is working

-- 1. Check if email queue table exists
SELECT 
  'onboarding_email_queue table' as check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'onboarding_email_queue'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 2. Check if email_send_logs table exists
SELECT 
  'email_send_logs table' as check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'email_send_logs'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 3. Check if email_templates table exists
SELECT 
  'email_templates table' as check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'email_templates'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 4. Check recent signups (last 7 days)
SELECT 
  'Recent signups (last 7 days)' as metric,
  COUNT(*) as count,
  STRING_AGG(DISTINCT role, ', ') as roles
FROM profiles 
WHERE created_at > NOW() - INTERVAL '7 days'
  AND role IN ('student', 'tutor', 'parent');

-- 5. Check queued emails (any status)
SELECT 
  'Email queue entries' as metric,
  COUNT(*) as count,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
  COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_count
FROM onboarding_email_queue;

-- 6. Check queued emails (by active status)
SELECT 
  CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END as status,
  COUNT(*) as count,
  MIN(next_send_at) as earliest_scheduled,
  MAX(next_send_at) as latest_scheduled
FROM onboarding_email_queue
GROUP BY is_active
ORDER BY is_active DESC;

-- 7. Check if any emails were sent recently
SELECT 
  'Emails sent (last 24 hours)' as metric,
  COUNT(*) as count
FROM email_send_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- 8. Check recent users WITHOUT queued emails (the problem!)
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.created_at,
  CASE 
    WHEN EXISTS (SELECT 1 FROM onboarding_email_queue WHERE user_id = p.id)
    THEN '✅ Has queued emails'
    ELSE '❌ NO EMAILS QUEUED'
  END as email_status
FROM profiles p
WHERE p.created_at > NOW() - INTERVAL '7 days'
  AND p.role IN ('student', 'tutor', 'parent')
ORDER BY p.created_at DESC;

-- 9. Check email templates availability
SELECT 
  user_type,
  name,
  CASE WHEN html_content IS NOT NULL THEN '✅ Has content' ELSE '❌ Missing content' END as status
FROM email_templates
WHERE user_type IN ('student', 'tutor', 'parent')
ORDER BY user_type, name;

-- 10. Check overdue emails (should have been sent but weren't)
SELECT 
  COUNT(*) as overdue_emails,
  MIN(next_send_at) as oldest_overdue
FROM onboarding_email_queue
WHERE is_active = true 
  AND next_send_at < NOW();

-- 11. Summary Report
SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days' AND role IN ('student', 'tutor', 'parent')) = 0
    THEN '🟡 No recent signups to check'
    
    WHEN (SELECT COUNT(*) FROM profiles p WHERE p.created_at > NOW() - INTERVAL '7 days' AND p.role IN ('student', 'tutor', 'parent') AND NOT EXISTS (SELECT 1 FROM onboarding_email_queue WHERE user_id = p.id)) > 0
    THEN '🔴 PROBLEM: Users signed up but no emails queued!'
    
    WHEN (SELECT COUNT(*) FROM onboarding_email_queue WHERE is_active = true AND next_send_at < NOW()) > 0
    THEN '🟠 WARNING: Overdue emails exist (cron job may not be running)'
    
    ELSE '🟢 System looks healthy'
  END as diagnosis;

-- 12. Show actual queue entries for recent users
SELECT 
  q.user_id,
  p.email,
  p.role as user_type,
  q.stage,
  q.next_send_at,
  q.is_active,
  q.last_sent_at,
  q.created_at as queued_at,
  CASE 
    WHEN q.next_send_at < NOW() AND q.is_active THEN '⏰ OVERDUE'
    WHEN q.is_active THEN '⏳ Scheduled'
    ELSE '✅ Sent or inactive'
  END as queue_status
FROM onboarding_email_queue q
JOIN profiles p ON p.id = q.user_id
WHERE p.created_at > NOW() - INTERVAL '7 days'
ORDER BY q.created_at DESC;
