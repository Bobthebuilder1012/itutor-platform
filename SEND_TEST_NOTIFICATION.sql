-- =====================================================
-- SEND TEST NOTIFICATION TO JOVANMR ACCOUNT
-- =====================================================
-- This script will:
-- 1. Find the JovanMR user
-- 2. Check if they have push tokens
-- 3. Insert a test notification
-- =====================================================

-- 1) Find the JovanMR user
SELECT 
  id,
  username,
  full_name,
  email,
  role
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovan%';

-- 2) Check if JovanMR has push tokens registered
SELECT 
  pt.id,
  pt.user_id,
  pt.platform,
  pt.created_at,
  pt.last_used_at,
  p.username,
  p.full_name
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovan%'
ORDER BY pt.created_at DESC;

-- 3) Insert a test notification for JovanMR
-- IMPORTANT: Replace 'USER_ID_HERE' with the actual user_id from step 1
INSERT INTO notifications (
  user_id,
  type,
  title,
  message,
  metadata,
  is_read,
  created_at
)
SELECT 
  id as user_id,
  'TEST_NOTIFICATION' as type,
  'Test Notification from iTutor' as title,
  'This is a test notification to verify your push notifications are working correctly. If you can see this, notifications are working! 🎉' as message,
  jsonb_build_object(
    'test', true,
    'sent_at', now()::text,
    'test_type', 'manual_test'
  ) as metadata,
  false as is_read,
  now() as created_at
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovan%'
LIMIT 1;

-- 4) Verify the notification was created
SELECT 
  n.id,
  n.type,
  n.title,
  n.message,
  n.created_at,
  n.is_read,
  p.username,
  p.full_name
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE (p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovan%')
  AND n.type = 'TEST_NOTIFICATION'
ORDER BY n.created_at DESC
LIMIT 5;

-- 5) Check if they can see it in their notifications page
-- This query shows what would appear on their notifications page
SELECT 
  n.id,
  n.type,
  n.title,
  n.message,
  n.metadata,
  n.is_read,
  n.created_at,
  CASE 
    WHEN n.created_at > now() - interval '1 minute' THEN 'Just now'
    WHEN n.created_at > now() - interval '1 hour' THEN EXTRACT(MINUTE FROM now() - n.created_at)::text || ' minutes ago'
    WHEN n.created_at > now() - interval '1 day' THEN EXTRACT(HOUR FROM now() - n.created_at)::text || ' hours ago'
    ELSE EXTRACT(DAY FROM now() - n.created_at)::text || ' days ago'
  END as time_ago
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE (p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovan%')
ORDER BY n.created_at DESC
LIMIT 10;
