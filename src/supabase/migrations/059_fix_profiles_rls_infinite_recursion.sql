-- =====================================================
-- Fix Infinite Recursion in Profiles RLS Policies
-- =====================================================
-- Issue: is_admin() and is_admin_or_reviewer() functions
-- query the profiles table, causing infinite recursion
-- when RLS policies on profiles also use these functions.
--
-- Solution: Simplify profiles RLS to allow public reads
-- (necessary for tutor platform) and use direct checks
-- without recursive function calls.

-- Drop ALL existing policies on profiles to start fresh
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Parents can read children profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and reviewers can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins and reviewers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

-- =============================================================================
-- NEW SIMPLIFIED POLICIES (No infinite recursion)
-- =============================================================================

-- SELECT: Allow public reads (tutors need to be discoverable)
CREATE POLICY "Anyone can read profiles"
ON public.profiles FOR SELECT
USING (true);

-- UPDATE: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- UPDATE: Service role can update any profile (for admin operations)
CREATE POLICY "Service role can update profiles"
ON public.profiles FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- INSERT: Users can insert their own profile during signup
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- INSERT: Service role can insert any profile
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

-- DELETE: Only service role can delete profiles
CREATE POLICY "Service role can delete profiles"
ON public.profiles FOR DELETE
TO service_role
USING (true);

-- =============================================================================
-- Note: is_admin() and is_admin_or_reviewer() functions will still work
-- for OTHER tables' RLS policies since "Anyone can read profiles" allows
-- these functions to query profiles without triggering recursion.
-- =============================================================================
