-- =====================================================
-- GRANT ADMIN ACCESS TO YOUR ACCOUNT
-- =====================================================
-- Run this in Supabase SQL Editor to give yourself admin access

-- STEP 1: Check your current account status
SELECT 
  id,
  email,
  full_name,
  role,
  is_reviewer,
  CASE 
    WHEN is_reviewer = true OR role = 'admin' THEN '✅ Has Admin Access'
    ELSE '❌ NO Admin Access'
  END as admin_status
FROM profiles
WHERE email = 'your-email@example.com'  -- Replace with your email
ORDER BY created_at DESC
LIMIT 5;

-- STEP 2: Grant admin access (choose ONE option below)

-- OPTION A: Set as reviewer (recommended for admin access)
-- UPDATE profiles 
-- SET is_reviewer = true
-- WHERE email = 'your-email@example.com';  -- Replace with your email

-- OPTION B: Set role to admin
-- UPDATE profiles 
-- SET role = 'admin'
-- WHERE email = 'your-email@example.com';  -- Replace with your email

-- STEP 3: Verify the change
-- SELECT 
--   id,
--   email,
--   full_name,
--   role,
--   is_reviewer,
--   CASE 
--     WHEN is_reviewer = true OR role = 'admin' THEN '✅ Has Admin Access'
--     ELSE '❌ NO Admin Access'
--   END as admin_status
-- FROM profiles
-- WHERE email = 'your-email@example.com';  -- Replace with your email
