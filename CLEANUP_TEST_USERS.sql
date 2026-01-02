-- ============================================================================
-- CLEANUP TEST USERS FROM iTUTOR PLATFORM
-- ============================================================================
-- This script safely removes all test users and their associated data
-- ============================================================================

-- Display what will be deleted
SELECT 
  'TEST DATA TO BE DELETED:' as notice,
  '' as separator;

SELECT 
  role,
  COUNT(*) as users_to_delete
FROM profiles
WHERE is_test_data = true
GROUP BY role
ORDER BY role;

SELECT 
  'Total test users:' as description,
  COUNT(*) as count
FROM profiles
WHERE is_test_data = true;

-- Count related data
SELECT 
  'Tutor subjects to delete:' as description,
  COUNT(*) as count
FROM tutor_subjects ts
JOIN profiles p ON ts.tutor_id = p.id
WHERE p.is_test_data = true;

SELECT 
  'Verified subjects to delete:' as description,
  COUNT(*) as count
FROM tutor_verified_subjects tvs
JOIN profiles p ON tvs.tutor_id = p.id
WHERE p.is_test_data = true;

-- Confirmation prompt (comment out the DELETE to be safe)
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'READY TO DELETE TEST DATA';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Review the counts above.';
  RAISE NOTICE 'Uncomment the DELETE statement below to proceed.';
  RAISE NOTICE '========================================';
END $$;

-- UNCOMMENT THE LINE BELOW TO DELETE ALL TEST DATA:
-- DELETE FROM profiles WHERE is_test_data = true;

-- After deletion, verify cleanup
-- SELECT COUNT(*) as remaining_test_users FROM profiles WHERE is_test_data = true;

