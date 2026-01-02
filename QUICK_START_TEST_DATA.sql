-- ============================================================================
-- QUICK START - Test Data Generation
-- ============================================================================
-- Copy and paste this entire file into Supabase SQL Editor and run
-- ============================================================================

-- STEP 1: Add the is_test_data column (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_test_data BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added is_test_data column to profiles table';
  ELSE
    RAISE NOTICE 'is_test_data column already exists';
  END IF;
END $$;

-- STEP 2: Run the full seed script
-- Open SEED_TEST_USERS.sql and run it, OR continue here with verification queries

-- ============================================================================
-- VERIFICATION QUERIES (Run after seeding)
-- ============================================================================

-- Check total test users created
SELECT 
  '📊 Total Test Users by Role' as report,
  role,
  COUNT(*) as count
FROM profiles
WHERE is_test_data = true
GROUP BY role
ORDER BY 
  CASE role 
    WHEN 'tutor' THEN 1 
    WHEN 'student' THEN 2 
    WHEN 'parent' THEN 3 
  END;

-- Check tutor subject distribution
SELECT 
  '📚 Top 10 Subjects by Tutor Count' as report,
  s.name as subject_name,
  COUNT(DISTINCT ts.tutor_id) as tutor_count,
  COUNT(DISTINCT tvs.id) as verified_count,
  CONCAT('$', ROUND(MIN(ts.price_per_hour_ttd), 0), ' - $', ROUND(MAX(ts.price_per_hour_ttd), 0)) as rate_range
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
LEFT JOIN tutor_verified_subjects tvs ON ts.tutor_id = tvs.tutor_id AND ts.subject_id = tvs.subject_id
JOIN profiles p ON ts.tutor_id = p.id
WHERE p.is_test_data = true
GROUP BY s.name
ORDER BY tutor_count DESC
LIMIT 10;

-- Check student distribution by school
SELECT 
  '🏫 Student Distribution by School' as report,
  school,
  COUNT(*) as student_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM profiles
WHERE is_test_data = true AND role = 'student'
GROUP BY school
ORDER BY student_count DESC;

-- Check verified tutors
SELECT 
  '✅ Verification Statistics' as report,
  COUNT(DISTINCT tvs.tutor_id) as verified_tutors,
  COUNT(*) as verified_subjects,
  ROUND(COUNT(DISTINCT tvs.tutor_id) * 100.0 / 
    (SELECT COUNT(*) FROM profiles WHERE is_test_data = true AND role = 'tutor'), 1) as verification_percentage
FROM tutor_verified_subjects tvs
JOIN profiles p ON tvs.tutor_id = p.id
WHERE p.is_test_data = true;

-- Sample verified tutors with their subjects
SELECT 
  '🎯 Sample Verified Tutors' as report,
  p.full_name as tutor_name,
  p.school,
  s.name as subject_name,
  tvs.grade as grade_achieved,
  CONCAT('$', ts.price_per_hour_ttd, '/hr') as rate
FROM profiles p
JOIN tutor_subjects ts ON p.id = ts.tutor_id
JOIN subjects s ON ts.subject_id = s.id
JOIN tutor_verified_subjects tvs ON ts.tutor_id = tvs.tutor_id AND ts.subject_id = tvs.subject_id
WHERE p.is_test_data = true
ORDER BY p.full_name, s.name
LIMIT 15;

-- ============================================================================
-- CLEANUP (Uncomment to delete all test data)
-- ============================================================================

-- CAUTION: This will permanently delete all test users and their data
-- Uncomment the line below only when you're ready to clean up:

-- DELETE FROM profiles WHERE is_test_data = true;

-- Verify cleanup (should return 0)
-- SELECT COUNT(*) as remaining_test_users FROM profiles WHERE is_test_data = true;

