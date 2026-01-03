-- =====================================================
-- FIX PROFILE INSERT POLICY FOR SIGNUP
-- =====================================================
-- Allow authenticated users to insert their own profile during signup

BEGIN;

-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can create any profile" ON public.profiles;

-- Create a simple, permissive INSERT policy for authenticated users
CREATE POLICY "Authenticated users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Allow service role to insert (for migrations/scripts)
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow admins to insert any profile
CREATE POLICY "Admins can insert any profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
);

COMMIT;




