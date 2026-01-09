-- =====================================================
-- FIX PROFILE UPDATE POLICY FOR NEW USERS
-- =====================================================
-- The UPDATE policy was blocking profile updates during signup
-- because auth.uid() is NULL before email confirmation.
-- This mirrors the INSERT policy fix from migration 060.

BEGIN;

-- Drop the restrictive UPDATE policy
DROP POLICY IF EXISTS "profiles_user_update_own_v2" ON public.profiles;

-- Create a new UPDATE policy that allows:
-- 1. Authenticated users to update their own profile
-- 2. Newly created profiles (within 5 minutes) with incomplete data to be updated
CREATE POLICY "profiles_update_own_or_new_v3"
ON public.profiles FOR UPDATE
USING (
  -- Allow authenticated users to update their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow updates for NEW profiles (created within 5 minutes) during signup
  -- This allows setting role, username, etc. before email confirmation
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
)
WITH CHECK (
  -- Same conditions for WITH CHECK
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
);

COMMIT;

-- Note: This allows the signup flow to set role and username even before
-- email confirmation, fixing the "account setup incomplete" loop.

