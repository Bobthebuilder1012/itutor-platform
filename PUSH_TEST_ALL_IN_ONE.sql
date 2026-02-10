-- ===============================================
-- PUSH NOTIFICATION TEST - ALL IN ONE
-- ===============================================
-- Deletes ALL JovanMR sessions/bookings and creates fresh test
-- Run this ONCE and it will work
-- ===============================================

DO $$
DECLARE
  v_jovan_id uuid;
  v_tutor_id uuid;
  v_subject_id uuid;
  v_booking_id uuid;
  v_session_id uuid;
  v_session_start timestamptz;
  v_deleted_sessions int;
  v_deleted_bookings int;
BEGIN
  -- Get JovanMR's user_id
  SELECT id INTO v_jovan_id
  FROM profiles
  WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%'
  LIMIT 1;

  IF v_jovan_id IS NULL THEN
    RAISE EXCEPTION 'JovanMR user not found!';
  END IF;

  RAISE NOTICE '📱 Found JovanMR: %', v_jovan_id;

  -- STEP 1: DELETE ALL SESSIONS (CASCADE will handle foreign keys)
  DELETE FROM sessions WHERE student_id = v_jovan_id;
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;
  RAISE NOTICE '🗑️  Deleted % sessions', v_deleted_sessions;

  -- STEP 2: DELETE ALL BOOKINGS from last 30 days (to be safe)
  DELETE FROM bookings 
  WHERE student_id = v_jovan_id 
    AND created_at > now() - interval '30 days';
  GET DIAGNOSTICS v_deleted_bookings = ROW_COUNT;
  RAISE NOTICE '🗑️  Deleted % bookings', v_deleted_bookings;

  -- STEP 3: Get a tutor
  SELECT id INTO v_tutor_id
  FROM profiles
  WHERE role = 'tutor'
  LIMIT 1;

  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'No tutor found!';
  END IF;

  -- STEP 4: Get a subject
  SELECT id INTO v_subject_id FROM subjects LIMIT 1;

  -- STEP 5: Set session start time to 10 minutes from now
  v_session_start := now() + interval '10 minutes';

  RAISE NOTICE '⏰ Creating session for: %', v_session_start;

  -- STEP 6: Create booking
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
    '🧪 PUSH TEST - ' || now()::text
  )
  RETURNING id INTO v_booking_id;

  RAISE NOTICE '✅ Booking created: %', v_booking_id;

  -- STEP 7: Create session
  INSERT INTO sessions (
    booking_id,
    tutor_id,
    student_id,
    provider,
    scheduled_start_at,
    scheduled_end_at,
    duration_minutes,
    no_show_wait_minutes,
    min_payable_minutes,
    status,
    charge_scheduled_at,
    charge_amount_ttd,
    payout_amount_ttd,
    platform_fee_ttd,
    notes
  ) VALUES (
    v_booking_id,
    v_tutor_id,
    v_jovan_id,
    'google_meet',
    v_session_start,
    v_session_start + interval '1 hour',
    60,
    10,
    15,
    'SCHEDULED',
    v_session_start + interval '1 hour',
    0,
    0,
    0,
    jsonb_build_object('test', true, 'push_notification_test', true)
  )
  RETURNING id INTO v_session_id;

  RAISE NOTICE '✅ Session created: %', v_session_id;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE '🔔 PUSH NOTIFICATION TEST READY!';
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE 'Session starts at: %', v_session_start;
  RAISE NOTICE 'Minutes until start: %', EXTRACT(EPOCH FROM (v_session_start - now())) / 60;
  RAISE NOTICE '';
  RAISE NOTICE '📱 NEXT STEPS:';
  RAISE NOTICE '1. Wait 1-2 minutes for Edge Function to run';
  RAISE NOTICE '2. Check your device for push notification';
  RAISE NOTICE '3. Verify with: SELECT * FROM notifications_log ORDER BY sent_at DESC LIMIT 5;';
  RAISE NOTICE '';
END $$;

-- Show the created session
SELECT 
  '✅ Created Session:' as status,
  s.id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.status,
  p.username as student
FROM sessions s
JOIN profiles p ON p.id = s.student_id
WHERE p.username ILIKE '%jovan%'
ORDER BY s.created_at DESC
LIMIT 1;

-- Check push tokens
SELECT 
  '📱 Push Tokens:' as status,
  COUNT(*) as token_count,
  array_agg(pt.platform) as platforms
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
WHERE p.username ILIKE '%jovan%';
