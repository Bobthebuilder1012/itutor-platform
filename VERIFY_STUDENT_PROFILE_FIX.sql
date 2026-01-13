-- =====================================================
-- VERIFY STUDENT PROFILE FIX
-- Run this to check if RLS policies are working correctly
-- =====================================================

-- 1. Check if RLS policies exist
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Expected output should include:
-- - "Users can view their own profile"
-- - "Tutor profiles are public"
-- - "Tutors can view student profiles"
-- - "Tutors can view parent profiles"

-- 2. Test query (as tutor) to see if you can read student profiles
-- This will show you all student profiles you should be able to see
SELECT 
  id,
  username,
  display_name,
  full_name,
  role
FROM public.profiles
WHERE role = 'student'
LIMIT 5;

-- If this returns results, the RLS is working
-- If it returns 0 rows, the RLS policy needs to be fixed

-- =====================================================
-- IF THE ABOVE SHOWS NO RESULTS, RUN THIS FIX:
-- =====================================================

-- Drop and recreate the policy to ensure it works
DROP POLICY IF EXISTS "Tutors can view student profiles" ON public.profiles;

CREATE POLICY "Tutors can view student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student' 
  AND EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'tutor'
  )
);

-- Test again after running the fix
SELECT 
  id,
  username,
  display_name,
  full_name,
  role
FROM public.profiles
WHERE role = 'student'
LIMIT 5;

-- =====================================================
-- ALTERNATIVE SIMPLER FIX (if above doesn't work):
-- Make student profiles viewable by all authenticated users
-- =====================================================

DROP POLICY IF EXISTS "Tutors can view student profiles" ON public.profiles;

CREATE POLICY "Students can be viewed by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'student');

-- This allows any authenticated user (including tutors) to view student profiles
-- More permissive but simpler and works reliably

-- Final test
SELECT 
  id,
  username,
  display_name,
  full_name,
  role
FROM public.profiles
WHERE role = 'student'
LIMIT 5;

-- ✅ If this returns results, you're good to go!














