-- =====================================================
-- DIAGNOSE: Welcome Email System Status
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
  'Emails in queue (all)' as metric,
  COUNT(*) as count,
  STRING_AGG(DISTINCT status, ', ') as statuses
FROM onboarding_email_queue;

-- 6. Check queued emails (by status)
SELECT 
  status,
  COUNT(*) as count,
  MIN(scheduled_for) as earliest_scheduled,
  MAX(scheduled_for) as latest_scheduled
FROM onboarding_email_queue
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'pending' THEN 1
    WHEN 'sent' THEN 2
    WHEN 'failed' THEN 3
    WHEN 'cancelled' THEN 4
    ELSE 5
  END;

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

-- 10. Check trigger exists
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  CASE 
    WHEN trigger_name = 'auto_queue_onboarding_emails' THEN '✅ Trigger exists'
    ELSE 'ℹ️ Trigger name: ' || trigger_name
  END as status
FROM information_schema.triggers
WHERE event_object_table = 'profiles'
  AND trigger_name LIKE '%onboarding%';

-- 11. Summary Report
SELECT 
  '=== WELCOME EMAIL SYSTEM DIAGNOSIS ===' as report_section;

SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days' AND role IN ('student', 'tutor', 'parent')) = 0
    THEN '🟡 No recent signups to check'
    
    WHEN (SELECT COUNT(*) FROM profiles p WHERE p.created_at > NOW() - INTERVAL '7 days' AND p.role IN ('student', 'tutor', 'parent') AND NOT EXISTS (SELECT 1 FROM onboarding_email_queue WHERE user_id = p.id)) > 0
    THEN '🔴 PROBLEM: Users signed up but no emails queued!'
    
    WHEN (SELECT COUNT(*) FROM onboarding_email_queue WHERE status = 'pending' AND scheduled_for < NOW()) > 0
    THEN '🟠 WARNING: Pending emails overdue (cron job may not be running)'
    
    ELSE '🟢 System looks healthy'
  END as diagnosis;
