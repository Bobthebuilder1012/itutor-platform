-- =====================================================
-- OPTION 1: SEND IN-APP NOTIFICATION TO JOVANMR
-- =====================================================
-- Copy and paste this entire script into Supabase SQL Editor
-- This will create an in-app notification (shows in notification bell)
-- =====================================================

-- Step 1: Verify JovanMR user exists
SELECT 
  '✅ Found user:' as status,
  id,
  username,
  email,
  role
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovangoodluck%' OR email ILIKE '%jovan%'
ORDER BY created_at DESC
LIMIT 1;

-- Step 2: Send test notification
-- Using 'new_message' type (a valid type from the constraint)
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
  'new_message' as type,
  '🔔 Test Notification from iTutor' as title,
  'This is a test notification to verify your notifications are working! If you can see this in your notification bell, everything is set up correctly. 🎉' as message,
  jsonb_build_object(
    'test', true,
    'sent_at', now()::text,
    'test_type', 'manual_verification',
    'sent_by', 'admin'
  ) as metadata,
  false as is_read,
  now() as created_at
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovangoodluck%' OR email ILIKE '%jovan%'
LIMIT 1
RETURNING 
  id as notification_id,
  user_id,
  type,
  title,
  '✅ NOTIFICATION SENT!' as status;

-- Step 3: Verify notification was created
SELECT 
  '✅ Verification:' as step,
  n.id as notification_id,
  n.type,
  n.title,
  n.message,
  n.created_at,
  n.is_read,
  p.username,
  p.email,
  '📱 Check notification bell on JovanMR account' as action
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE (p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%')
  AND n.created_at > now() - interval '1 minute'
ORDER BY n.created_at DESC
LIMIT 1;

-- Step 4: Count all notifications for JovanMR
SELECT 
  '📊 JovanMR Notification Summary:' as summary,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE n.is_read = false) as unread_notifications,
  COUNT(*) FILTER (WHERE n.is_read = true) as read_notifications,
  MAX(n.created_at) as latest_notification
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%';

-- Step 5: Instructions
SELECT 
  '═══════════════════════════════════════' as line1,
  '✅ TEST NOTIFICATION SENT SUCCESSFULLY!' as title,
  '═══════════════════════════════════════' as line2,
  '' as blank1,
  '📋 WHAT TO DO NEXT:' as next_steps_title,
  '' as blank2,
  '1. Log in to JovanMR account on the website' as step1,
  '2. Look at the notification bell icon (top right)' as step2,
  '3. Should see a red badge with number (1)' as step3,
  '4. Click the bell to see the test notification' as step4,
  '5. Notification should say "Test Notification from iTutor"' as step5,
  '' as blank3,
  '🎯 EXPECTED RESULT:' as expected_title,
  '- Notification bell shows red badge' as expected1,
  '- Clicking bell shows the test message' as expected2,
  '- Notification has green/blue background' as expected3,
  '' as blank4,
  '❓ If notification does NOT appear:' as troubleshoot_title,
  '- Hard refresh browser (Ctrl+Shift+R)' as troubleshoot1,
  '- Check browser console for errors' as troubleshoot2,
  '- Verify RLS policies on notifications table' as troubleshoot3,
  '- Run: SELECT * FROM notifications WHERE user_id = (SELECT id FROM profiles WHERE username = ''JovanMR'')' as troubleshoot4;
