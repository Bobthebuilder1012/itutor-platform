-- =====================================================
-- TRIGGER PUSH NOTIFICATION TEST (via Edge Function simulation)
-- =====================================================
-- This creates a session reminder scenario to trigger actual push notification
-- =====================================================

-- 1) Find JovanMR user
SELECT 
  id,
  username,
  email,
  role
FROM profiles
WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovan%';

-- 2) Check their push tokens
SELECT 
  pt.*,
  p.username
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovan%';

-- 3) Create a test session starting in 10 minutes (to trigger session reminder)
-- IMPORTANT: This will only work if the session-reminder-10-min Edge Function is running
-- First, find a tutor account to use
DO $$
DECLARE
  v_student_id uuid;
  v_tutor_id uuid;
  v_booking_id uuid;
  v_session_id uuid;
BEGIN
  -- Get JovanMR user ID (assuming they're a student)
  SELECT id INTO v_student_id
  FROM profiles
  WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovan%'
  LIMIT 1;

  -- Get a tutor ID (any tutor)
  SELECT id INTO v_tutor_id
  FROM profiles
  WHERE role = 'tutor'
  LIMIT 1;

  -- If JovanMR is a tutor, swap them
  IF NOT FOUND OR v_student_id = v_tutor_id THEN
    -- JovanMR might be a tutor, so get a student instead
    SELECT id INTO v_student_id
    FROM profiles
    WHERE role = 'student'
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Student ID: %, Tutor ID: %', v_student_id, v_tutor_id;

  -- Create a test booking (or find existing)
  INSERT INTO bookings (
    student_id,
    tutor_id,
    subject_id,
    requested_start_at,
    requested_end_at,
    confirmed_start_at,
    confirmed_end_at,
    status,
    price_ttd,
    duration_minutes
  )
  SELECT
    v_student_id,
    v_tutor_id,
    (SELECT id FROM subjects LIMIT 1), -- Any subject
    now() + interval '10 minutes',
    now() + interval '70 minutes',
    now() + interval '10 minutes',
    now() + interval '70 minutes',
    'CONFIRMED',
    0,
    60
  WHERE v_student_id IS NOT NULL AND v_tutor_id IS NOT NULL
  RETURNING id INTO v_booking_id;

  RAISE NOTICE 'Created booking: %', v_booking_id;

  -- Create a test session
  IF v_booking_id IS NOT NULL THEN
    INSERT INTO sessions (
      booking_id,
      student_id,
      tutor_id,
      scheduled_start_at,
      scheduled_end_at,
      duration_minutes,
      status
    )
    VALUES (
      v_booking_id,
      v_student_id,
      v_tutor_id,
      now() + interval '10 minutes',
      now() + interval '70 minutes',
      60,
      'SCHEDULED'
    )
    RETURNING id INTO v_session_id;

    RAISE NOTICE 'Created session: %', v_session_id;
    RAISE NOTICE 'Session will start at: %', now() + interval '10 minutes';
    RAISE NOTICE 'Edge Function should send notification when it runs next';
  END IF;
END $$;

-- 4) Verify the session was created
SELECT 
  s.id as session_id,
  s.scheduled_start_at,
  s.status,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  p_student.username as student,
  p_tutor.username as tutor
FROM sessions s
JOIN profiles p_student ON p_student.id = s.student_id
JOIN profiles p_tutor ON p_tutor.id = s.tutor_id
WHERE s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '15 minutes'
ORDER BY s.scheduled_start_at DESC
LIMIT 5;

-- 5) Check notifications log to see if notification was already sent
SELECT 
  nl.id,
  nl.user_id,
  nl.session_id,
  nl.type,
  nl.sent_at,
  p.username
FROM notifications_log nl
JOIN profiles p ON p.id = nl.user_id
WHERE (p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovan%')
  AND nl.type = 'SESSION_REMINDER_10_MIN'
ORDER BY nl.sent_at DESC
LIMIT 5;

-- 6) Instructions
SELECT 
  '✅ Test session created!' as status,
  'The session-reminder-10-min Edge Function will send a push notification when it runs next (every 1-2 minutes).' as note,
  'Check the user''s device or browser for the notification.' as action;
