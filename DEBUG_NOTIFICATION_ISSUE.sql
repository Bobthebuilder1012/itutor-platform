-- DEBUG: Check if notification was created and why it's not showing

-- Step 1: Find JovanMR's user_id
SELECT 
  '🔍 Step 1: JovanMR User Info' as step,
  id as user_id,
  username,
  email,
  role
FROM profiles
WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%'
LIMIT 5;

-- Step 2: Check ALL notifications for this user (bypass RLS by using admin query)
SELECT 
  '📬 Step 2: All Notifications in Database for JovanMR' as step,
  n.id,
  n.type,
  n.title,
  n.message,
  n.is_read,
  n.created_at,
  n.user_id,
  p.username
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%'
ORDER BY n.created_at DESC
LIMIT 10;

-- Step 3: Check RLS policies on notifications table
SELECT 
  '🔒 Step 3: RLS Policies on Notifications Table' as step,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'notifications';

-- Step 4: Check if notifications table has RLS enabled
SELECT 
  '🔐 Step 4: Is RLS Enabled?' as step,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'notifications';

-- Step 5: Count notifications
SELECT 
  '📊 Step 5: Total Notification Counts' as step,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE user_id IN (
    SELECT id FROM profiles WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%'
  )) as jovanmr_notifications,
  COUNT(*) FILTER (WHERE created_at > now() - interval '10 minutes') as recent_notifications
FROM notifications;
