-- =====================================================
-- DEBUG VERIFICATION REQUESTS VISIBILITY
-- =====================================================

-- 1. Show ALL verification requests (ignore RLS)
SET LOCAL ROLE postgres;
SELECT 
  id,
  tutor_id,
  status,
  created_at,
  file_path,
  file_type
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check RLS policies on the table
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'tutor_verification_requests';

-- 3. Test what the admin can see (with RLS)
-- Replace 'YOUR_ADMIN_ID' with your actual admin user ID
-- Or run: SELECT id FROM profiles WHERE email = 'your@email.com';
/*
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'YOUR_ADMIN_ID';
SELECT 
  id,
  tutor_id,
  status,
  created_at
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 10;
*/

-- 4. Verify your admin account
SELECT 
  id,
  email,
  role,
  is_reviewer,
  full_name
FROM profiles
WHERE is_reviewer = true OR role = 'admin';





