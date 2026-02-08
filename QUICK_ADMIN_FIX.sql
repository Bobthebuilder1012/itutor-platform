-- =====================================================
-- QUICK FIX: Admin Access Management
-- =====================================================

-- OPTION 1: Ensure admin@myitutor.com has admin access
UPDATE profiles 
SET is_reviewer = true
WHERE email = 'admin@myitutor.com';

-- OPTION 2: Grant admin access to your current account
-- First, find your current email:
SELECT 
  id,
  email,
  full_name,
  role,
  is_reviewer,
  CASE 
    WHEN is_reviewer = true OR role = 'admin' THEN '✅ Has Admin'
    ELSE '❌ No Admin - needs fix'
  END as admin_status
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- Then uncomment and run this with your email:
-- UPDATE profiles 
-- SET is_reviewer = true
-- WHERE email = 'YOUR-CURRENT-EMAIL@example.com';

-- Verify admin accounts:
SELECT 
  id,
  email,
  full_name,
  is_reviewer,
  role
FROM profiles
WHERE is_reviewer = true OR role = 'admin'
ORDER BY created_at DESC;
