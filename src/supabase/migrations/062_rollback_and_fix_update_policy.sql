-- =====================================================
-- ROLLBACK BAD POLICY AND APPLY CORRECT ONE
-- =====================================================
-- Migration 061 had a bug - it tried to query auth.users which
-- regular users don't have permission to access.
-- This migration drops the bad policy and creates the correct one.

BEGIN;

-- Drop ALL update policies to start fresh
DROP POLICY IF EXISTS "profiles_user_update_own_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_new_user_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_incomplete_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_new_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_update_v2" ON public.profiles;

-- Create the CORRECT UPDATE policy that:
-- 1. Allows authenticated users to update their own profile
-- 2. Allows NEW profiles (created < 5 min ago, role=NULL) to be updated during signup
-- This uses profiles.created_at (which we CAN read) instead of auth.users (which we CAN'T)
CREATE POLICY "profiles_update_own_or_recent_v4"
ON public.profiles FOR UPDATE
USING (
  -- Allow authenticated users to update their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow updates for profiles created within last 5 minutes with no role set
  -- This covers the signup flow before email confirmation
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
)
WITH CHECK (
  -- Same conditions for WITH CHECK
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
);

-- Recreate service role policy for admin operations
CREATE POLICY "profiles_service_role_update_v4"
ON public.profiles FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;

-- This policy now works because it only queries the profiles table
-- which the user has access to, not the auth.users table.




