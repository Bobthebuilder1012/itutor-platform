-- Check if verification tables exist

-- Check for tutor_verified_subjects table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'tutor_verified_subjects'
) AS tutor_verified_subjects_exists;

-- Check for tutor_verification_requests table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'tutor_verification_requests'
) AS tutor_verification_requests_exists;

-- If tutor_verification_requests exists, show its structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tutor_verification_requests'
ORDER BY ordinal_position;

-- Show all verified tutors
SELECT id, full_name, email, tutor_verification_status, tutor_verified_at
FROM profiles
WHERE role = 'tutor' 
AND tutor_verification_status = 'VERIFIED'
ORDER BY tutor_verified_at DESC;






