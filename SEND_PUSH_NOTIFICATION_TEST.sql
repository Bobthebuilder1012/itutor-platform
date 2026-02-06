-- ===============================================
-- PUSH NOTIFICATION TEST FOR JOVANMR
-- ===============================================
-- This script creates a test session scheduled 10 minutes from now
-- to trigger the session-reminder-10-min Edge Function which will
-- send a PUSH notification to JovanMR's device via FCM.
-- ===============================================

-- Step 1: Verify JovanMR exists and has push tokens
SELECT 
  '📱 Step 1: Push Token Status' as step,
  p.id as user_id,
  p.username,
  p.email,
  p.role,
  COUNT(pt.token) as push_token_count,
  jsonb_agg(jsonb_build_object(
    'platform', pt.platform,
    'created_at', pt.created_at,
    'last_used_at', pt.last_used_at
  )) FILTER (WHERE pt.token IS NOT NULL) as tokens
FROM profiles p
LEFT JOIN push_tokens pt ON pt.user_id = p.id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%'
GROUP BY p.id, p.username, p.email, p.role;

-- Step 2: Create a test booking and session for JovanMR
DO $$
DECLARE
  v_jovan_id uuid;
  v_tutor_id uuid;
  v_subject_id uuid;
  v_booking_id uuid;
  v_session_id uuid;
  v_session_start timestamptz;
BEGIN
  -- Get JovanMR's user_id
  SELECT id INTO v_jovan_id
  FROM profiles
  WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovangoodluck%' OR email ILIKE '%jovan%'
  LIMIT 1;

  IF v_jovan_id IS NULL THEN
    RAISE EXCEPTION 'JovanMR user not found!';
  END IF;

  -- Get any tutor (for the test booking)
  SELECT id INTO v_tutor_id
  FROM profiles
  WHERE role = 'tutor' AND tutor_verification_status = 'VERIFIED'
  LIMIT 1;

  IF v_tutor_id IS NULL THEN
    -- If no verified tutor, just get any tutor
    SELECT id INTO v_tutor_id
    FROM profiles
    WHERE role = 'tutor'
    LIMIT 1;
  END IF;

  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'No tutor found!';
  END IF;

  -- Get any subject
  SELECT id INTO v_subject_id
  FROM subjects
  LIMIT 1;

  -- Set session start time to exactly 10 minutes from now
  v_session_start := now() + interval '10 minutes';

  -- Create test booking
  INSERT INTO bookings (
    student_id,
    tutor_id,
    subject_id,
    status,
    requested_start_at,
    requested_end_at,
    confirmed_start_at,
    confirmed_end_at,
    price_ttd,
    student_notes
  ) VALUES (
    v_jovan_id,
    v_tutor_id,
    v_subject_id,
    'CONFIRMED',
    v_session_start,
    v_session_start + interval '1 hour',
    v_session_start,
    v_session_start + interval '1 hour',
    0,
    '🧪 TEST BOOKING - Push notification test'
  )
  RETURNING id INTO v_booking_id;

  -- Create test session (this will trigger the reminder notification)
  INSERT INTO sessions (
    booking_id,
    tutor_id,
    student_id,
    subject_id,
    scheduled_start_at,
    scheduled_end_at,
    duration_minutes,
    status,
    notes
  ) VALUES (
    v_booking_id,
    v_tutor_id,
    v_jovan_id,
    v_subject_id,
    v_session_start,
    v_session_start + interval '1 hour',
    60,
    'scheduled',
    '🧪 TEST SESSION - Push notification test (10 min reminder)'
  )
  RETURNING id INTO v_session_id;

  RAISE NOTICE 'Test session created: %', v_session_id;
  RAISE NOTICE 'Session starts at: %', v_session_start;
  RAISE NOTICE 'Notification should be sent by Edge Function within 2 minutes';
END $$;

-- Step 3: Verify the test session was created
SELECT 
  '✅ Step 3: Test Session Created' as step,
  s.id as session_id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.status,
  p.username as student_username,
  p.email as student_email,
  '⏰ Edge Function runs every minute and will send push notification soon!' as next_action
FROM sessions s
JOIN profiles p ON p.id = s.student_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%'
ORDER BY s.created_at DESC
LIMIT 1;

-- Step 4: Check recent notification activity in logs
SELECT 
  '📊 Step 4: Recent Notification Log Activity' as step,
  notification_type,
  COUNT(*) as count,
  MAX(sent_at) as last_sent
FROM notifications_log
WHERE sent_at > now() - interval '1 hour'
GROUP BY notification_type
ORDER BY last_sent DESC;

-- Step 5: Instructions
SELECT 
  '═══════════════════════════════════════════════════' as line1,
  '🔔 PUSH NOTIFICATION TEST INITIATED!' as title,
  '═══════════════════════════════════════════════════' as line2,
  '' as blank1,
  '📱 WHAT HAPPENS NEXT:' as section1,
  '1. The session-reminder-10-min Edge Function runs every 1 minute' as step1,
  '2. It will detect the session starting in ~10 minutes' as step2,
  '3. It will send a PUSH notification to JovanMR''s device via FCM' as step3,
  '4. Check your phone/device for the notification!' as step4,
  '' as blank2,
  '⏱️  TIMELINE:' as section2,
  '- Within 1-2 minutes: Push notification should arrive on device' as timeline1,
  '- Check notifications_log table to verify it was sent' as timeline2,
  '' as blank3,
  '🔍 TO VERIFY:' as section3,
  '1. Check your device for push notification' as verify1,
  '2. Run: SELECT * FROM notifications_log ORDER BY sent_at DESC LIMIT 5;' as verify2,
  '3. Check Edge Function logs in Supabase Dashboard' as verify3,
  '' as blank4,
  '⚠️  TROUBLESHOOTING:' as section4,
  '- If no notification after 3 minutes, check Edge Function logs' as troubleshoot1,
  '- Verify FCM service account is configured in Supabase' as troubleshoot2,
  '- Check push_tokens table has valid token for JovanMR' as troubleshoot3;
