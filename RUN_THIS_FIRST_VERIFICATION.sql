-- =====================================================
-- RUN THIS FIRST: Complete Notification System Check
-- =====================================================
-- Copy and paste this entire script into Supabase SQL Editor
-- It will verify everything is set up properly
-- =====================================================

-- Step 1: Find JovanMR user
SELECT 
  '📌 STEP 1: Find JovanMR User' as step,
  id,
  username,
  email,
  role
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovangoodluck%' OR email ILIKE '%jovan%'
ORDER BY created_at DESC;

-- Step 2: Check if JovanMR has push tokens
SELECT 
  '📌 STEP 2: Check JovanMR Push Tokens' as step,
  pt.id,
  pt.platform,
  pt.created_at,
  pt.last_used_at,
  CASE 
    WHEN pt.last_used_at IS NULL THEN 'Never used'
    WHEN pt.last_used_at > now() - interval '1 hour' THEN '✅ Used recently'
    WHEN pt.last_used_at > now() - interval '1 day' THEN 'Used today'
    ELSE 'Used ' || EXTRACT(DAY FROM now() - pt.last_used_at)::text || ' days ago'
  END as usage_status
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%'
ORDER BY pt.created_at DESC;

-- Step 3: Check notifications table exists and has data
SELECT 
  '📌 STEP 3: Check Notifications Table' as step,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') as table_exists,
  (SELECT COUNT(*) FROM notifications) as total_notifications,
  (SELECT COUNT(*) FROM notifications WHERE user_id IN (
    SELECT id FROM profiles WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%'
  )) as jovanmr_notifications;

-- Step 4: Check Edge Function activity
SELECT 
  '📌 STEP 4: Check Edge Function Activity (Last 24h)' as step,
  COUNT(*) as notifications_sent,
  COUNT(DISTINCT user_id) as users_notified,
  MIN(sent_at) as first_notification,
  MAX(sent_at) as last_notification
FROM notifications_log
WHERE sent_at > now() - interval '24 hours';

-- Step 5: Overall status summary
SELECT 
  '✅ VERIFICATION SUMMARY' as title,
  jsonb_build_object(
    'tables_exist', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name IN ('notifications', 'push_tokens', 'notifications_log')),
    'jovanmr_exists', EXISTS(SELECT 1 FROM profiles WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%'),
    'jovanmr_has_tokens', EXISTS(SELECT 1 FROM push_tokens pt JOIN profiles p ON p.id = pt.user_id WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%'),
    'system_active', EXISTS(SELECT 1 FROM notifications_log WHERE sent_at > now() - interval '24 hours'),
    'total_push_tokens', (SELECT COUNT(*) FROM push_tokens),
    'ready_for_test', EXISTS(SELECT 1 FROM profiles WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%')
  ) as verification_results;
