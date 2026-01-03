-- =====================================================
-- FINAL FIX: Allow profile creation during signup
-- even with email confirmation enabled
-- =====================================================

BEGIN;

-- Drop the authenticated-only INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert own profile" ON public.profiles;

-- Create a policy that works for BOTH authenticated AND anon users
-- This is necessary because during signup with email confirmation,
-- the user might not be fully authenticated yet
CREATE POLICY "Allow profile creation during signup"
ON public.profiles FOR INSERT
TO authenticated, anon
WITH CHECK (
  -- For authenticated users: must be their own ID
  (auth.role() = 'authenticated' AND id = auth.uid())
  OR
  -- For anon users during signup: allow if the ID matches the JWT sub claim
  (auth.role() = 'anon' AND id = auth.uid())
);

-- Keep service role policy
DROP POLICY IF EXISTS "Service role can insert any profile" ON public.profiles;
CREATE POLICY "Service role can insert any profile"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

COMMIT;

-- Verify the policy
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public' AND cmd = 'INSERT';




