-- =====================================================
-- FIX UPDATE WITH CHECK CLAUSE
-- =====================================================
-- The WITH CHECK clause was failing because it checks the row AFTER
-- the update, when role is no longer NULL. We need to allow the
-- transition from incomplete (role=NULL) to complete (role set).

BEGIN;

-- Drop the policy with the buggy WITH CHECK
DROP POLICY IF EXISTS "profiles_update_own_or_recent_v4" ON public.profiles;

-- Create the CORRECT policy with proper WITH CHECK logic
CREATE POLICY "profiles_update_own_or_recent_v5"
ON public.profiles FOR UPDATE
USING (
  -- USING checks the row BEFORE update
  -- Allow authenticated users to update their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow updates for profiles created within last 5 minutes with no role set
  -- This covers the signup flow before email confirmation
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
)
WITH CHECK (
  -- WITH CHECK checks the row AFTER update
  -- Allow if user is authenticated and owns the profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow if profile was recently created (even if role is now set)
  -- This allows the initial profile setup during signup
  (created_at > (NOW() - INTERVAL '5 minutes'))
);

COMMIT;

-- Key difference: WITH CHECK only requires created_at check, not role IS NULL
-- This allows the transition from role=NULL to role='student' during signup



