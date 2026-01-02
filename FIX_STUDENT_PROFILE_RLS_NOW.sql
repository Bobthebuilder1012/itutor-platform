-- =====================================================
-- IMMEDIATE FIX: Allow Tutors to View Student Profiles
-- Run this in Supabase SQL Editor NOW
-- =====================================================

-- Remove any conflicting policies
DROP POLICY IF EXISTS "Tutors can view student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Students can be viewed by authenticated users" ON public.profiles;

-- Create a simple, working policy
-- This allows ANY authenticated user to view student profiles
CREATE POLICY "Students can be viewed by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'student');

-- =====================================================
-- VERIFY IT WORKS
-- =====================================================

-- Test 1: Can you see student profiles?
SELECT 
  id,
  username,
  display_name,
  full_name,
  role,
  school,
  country
FROM public.profiles
WHERE role = 'student'
LIMIT 5;

-- If the above returns results, YOU'RE GOOD! ✅
-- If it returns 0 rows, there's a different issue

-- =====================================================
-- ALSO: Make sure profiles table has RLS enabled
-- =====================================================

-- Check if RLS is enabled on profiles
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'profiles';

-- If rowsecurity = false, enable it:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- LIST ALL CURRENT POLICIES (for debugging)
-- =====================================================

SELECT 
  policyname,
  tablename,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- ✅ After running this, refresh your browser and try again!





