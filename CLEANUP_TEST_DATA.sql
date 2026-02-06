-- ===============================================
-- CLEANUP OLD TEST DATA FOR JOVANMR
-- ===============================================
-- Run this first to clean up any old test sessions/bookings
-- ===============================================

-- Find JovanMR's user ID
DO $$
DECLARE
  v_jovan_id uuid;
BEGIN
  SELECT id INTO v_jovan_id
  FROM profiles
  WHERE username = 'JovanMR' OR username = 'Jovan1234' OR email ILIKE '%jovangoodluck%' OR email ILIKE '%jovan%'
  LIMIT 1;

  IF v_jovan_id IS NOT NULL THEN
    -- Delete all test sessions for JovanMR (CASCADE will handle bookings if needed)
    DELETE FROM sessions
    WHERE student_id = v_jovan_id 
      AND created_at > now() - interval '7 days';
    
    RAISE NOTICE 'Deleted sessions for JovanMR';

    -- Delete all test bookings for JovanMR that don't have sessions
    DELETE FROM bookings
    WHERE student_id = v_jovan_id 
      AND created_at > now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.booking_id = bookings.id);
    
    RAISE NOTICE 'Deleted orphaned bookings for JovanMR';
    RAISE NOTICE '✅ Cleanup complete! Now run SEND_PUSH_NOTIFICATION_TEST_V2.sql';
  ELSE
    RAISE NOTICE '⚠️  JovanMR user not found';
  END IF;
END $$;

-- Verify cleanup
SELECT 
  '✅ Cleanup Summary:' as status,
  COUNT(*) as remaining_sessions,
  MAX(s.created_at) as most_recent_session
FROM sessions s
JOIN profiles p ON p.id = s.student_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%';

SELECT 
  '✅ Bookings Summary:' as status,
  COUNT(*) as remaining_bookings,
  MAX(b.created_at) as most_recent_booking
FROM bookings b
JOIN profiles p ON p.id = b.student_id
WHERE p.username = 'JovanMR' OR p.username = 'Jovan1234' OR p.email ILIKE '%jovangoodluck%' OR p.email ILIKE '%jovan%';
