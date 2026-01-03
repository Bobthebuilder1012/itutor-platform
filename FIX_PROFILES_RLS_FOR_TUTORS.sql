-- =====================================================
-- FIX RLS POLICIES FOR PROFILES TABLE
-- Allow students to view tutor profiles
-- =====================================================

-- First, check current policies
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';

-- Drop existing SELECT policy if it's too restrictive
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create new policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Create new policy: All authenticated users can view tutor profiles
CREATE POLICY "Tutors are publicly viewable"
ON public.profiles
FOR SELECT
USING (role = 'tutor');

-- Create new policy: All authenticated users can view student profiles (for tutors to see their students)
CREATE POLICY "Students are viewable by authenticated users"
ON public.profiles
FOR SELECT
USING (role = 'student' OR role = 'parent');

-- Update policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Verify policies
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;








