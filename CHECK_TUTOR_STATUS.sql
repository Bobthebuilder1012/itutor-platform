-- Check current verification status of tutors
-- This will show if the database was actually updated

SELECT 
  id,
  full_name,
  email,
  role,
  tutor_verification_status,
  tutor_verified_at,
  created_at
FROM profiles
WHERE role = 'tutor'
ORDER BY 
  CASE 
    WHEN tutor_verification_status = 'VERIFIED' THEN 1
    ELSE 2
  END,
  full_name;



