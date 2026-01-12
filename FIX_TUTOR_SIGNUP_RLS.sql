-- =====================================================
-- FIX TUTOR SIGNUP - REMOVE AUTH.USERS QUERY
-- =====================================================
-- Problem: The INSERT policy tries to query auth.users which
-- regular users don't have permission to access.
-- This causes "permission denied for table users" error.
--
-- Solution: Simplify the INSERT policy to rely on the trigger
-- for initial profile creation, and allow authenticated users
-- to upsert their profile during signup.

BEGIN;

-- Drop the problematic INSERT policy that queries auth.users
DROP POLICY IF EXISTS "profiles_insert_own_or_new_user_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_insert_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_user_insert_own_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_insert_v2" ON public.profiles;

-- Create a simplified INSERT policy that doesn't query auth.users
-- This allows:
-- 1. Authenticated users to insert their own profile (normal signup)
-- 2. The trigger to insert profiles (uses SECURITY DEFINER, bypasses RLS)
CREATE POLICY "profiles_insert_own_v6"
ON public.profiles FOR INSERT
WITH CHECK (
  -- Allow authenticated users to insert their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
);

-- Service role can always insert (for admin operations and migrations)
CREATE POLICY "profiles_service_role_insert_v6"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

COMMIT;

-- This fix removes the auth.users query that was causing the permission error
-- The trigger (handle_new_user) will still create a basic profile on signup,
-- and the client-side upsert will fill in the role, username, etc.

