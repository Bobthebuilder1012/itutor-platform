-- =====================================================
-- FIX ADMIN ACCESS FOR CURRENTLY LOGGED IN USER
-- =====================================================

-- STEP 1: Find YOUR account (currently logged in)
-- Run this first to see your account details
SELECT 
  id,
  email,
  full_name,
  role,
  is_reviewer,
  created_at,
  CASE 
    WHEN is_reviewer = true OR role = 'admin' THEN '✅ HAS ADMIN ACCESS'
    ELSE '❌ NO ADMIN ACCESS - NEEDS FIX'
  END as status
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- STEP 2: Grant yourself admin access
-- Copy your email from above, then uncomment and run this:

-- UPDATE profiles 
-- SET is_reviewer = true
-- WHERE email = 'YOUR-EMAIL-HERE@example.com';

-- OR if you want to set multiple accounts at once:

-- UPDATE profiles 
-- SET is_reviewer = true
-- WHERE email IN (
--   'liamdavidrampersad@gmail.com',
--   'liamdavidrampersad04@gmail.com'
-- );

-- STEP 3: Verify the fix worked
-- SELECT 
--   id,
--   email,
--   full_name,
--   role,
--   is_reviewer,
--   CASE 
--     WHEN is_reviewer = true OR role = 'admin' THEN '✅ HAS ADMIN ACCESS'
--     ELSE '❌ NO ADMIN ACCESS'
--   END as status
-- FROM profiles
-- WHERE is_reviewer = true OR role = 'admin';

-- After running the UPDATE, refresh your browser and try again!
