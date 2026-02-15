-- ============================================
-- CHECK ADMIN/REVIEWER PERMISSIONS
-- ============================================
-- This script checks if a user has proper admin/reviewer access

-- Step 1: Check your current session/user
SELECT 
  id,
  email,
  role,
  full_name,
  is_reviewer,
  created_at
FROM public.profiles
WHERE email = 'admin@myitutor.com';

-- Step 2: Check all users with admin/reviewer privileges
SELECT 
  id,
  email,
  role,
  full_name,
  is_reviewer,
  created_at
FROM public.profiles
WHERE is_reviewer = true OR role = 'admin'
ORDER BY created_at DESC;

-- Step 3: Count total accounts in the system
SELECT 
  role,
  COUNT(*) as count,
  SUM(CASE WHEN is_suspended THEN 1 ELSE 0 END) as suspended_count
FROM public.profiles
GROUP BY role
ORDER BY count DESC;

-- Step 4: If you need to grant admin access to yourself
-- Uncomment this UPDATE statement if needed
/*
UPDATE public.profiles
SET is_reviewer = true
WHERE email = 'admin@myitutor.com';
*/

-- Step 5: Verify the update worked
SELECT 
  id,
  email,
  role,
  full_name,
  is_reviewer
FROM public.profiles
WHERE email = 'admin@myitutor.com';
