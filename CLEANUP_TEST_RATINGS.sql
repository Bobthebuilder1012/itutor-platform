-- =====================================================
-- CLEANUP TEST RATINGS
-- =====================================================
-- This script removes all test ratings, sessions, and bookings
-- added by ADD_TEST_RATINGS.sql
-- Only deletes items marked with is_test_data = true
-- =====================================================

DO $$
DECLARE
  ratings_count INTEGER;
  sessions_count INTEGER;
  bookings_count INTEGER;
BEGIN
  RAISE NOTICE '🧹 Starting cleanup of test data...';
  RAISE NOTICE '';

  -- Count how many will be deleted
  SELECT COUNT(*) INTO ratings_count
  FROM ratings
  WHERE is_test_data = true;

  SELECT COUNT(*) INTO sessions_count
  FROM sessions
  WHERE is_test_data = true;

  SELECT COUNT(*) INTO bookings_count
  FROM bookings
  WHERE is_test_data = true;

  RAISE NOTICE '   Found % test ratings to remove', ratings_count;
  RAISE NOTICE '   Found % test sessions to remove', sessions_count;
  RAISE NOTICE '   Found % test bookings to remove', bookings_count;
  RAISE NOTICE '';

  -- Delete in correct order (child to parent due to foreign keys)
  
  -- 1. Delete ratings (references sessions)
  DELETE FROM ratings
  WHERE is_test_data = true;

  RAISE NOTICE '   ✓ Deleted test ratings';

  -- 2. Delete sessions (references bookings)
  DELETE FROM sessions
  WHERE is_test_data = true;

  RAISE NOTICE '   ✓ Deleted test sessions';

  -- 3. Delete bookings
  DELETE FROM bookings
  WHERE is_test_data = true;

  RAISE NOTICE '   ✓ Deleted test bookings';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Cleanup complete!';
  RAISE NOTICE '   Removed % ratings, % sessions, and % bookings', ratings_count, sessions_count, bookings_count;
END $$;
