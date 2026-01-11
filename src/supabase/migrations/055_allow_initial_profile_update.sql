-- =====================================================
-- ALLOW INITIAL PROFILE UPDATE AFTER SIGNUP
-- =====================================================
-- Users need to be able to update their profile immediately
-- after signup, even if role is NULL

BEGIN;

-- Drop existing update policies that might be too restrictive
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Create a permissive policy for users updating their own profile
-- This allows updates even when role is NULL (during initial signup)
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Keep admin ability to update any profile
CREATE POLICY "Admins and reviewers can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
);

COMMIT;









