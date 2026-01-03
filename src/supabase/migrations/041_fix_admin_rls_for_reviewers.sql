-- =====================================================
-- FIX ADMIN RLS TO INCLUDE REVIEWERS
-- =====================================================
-- Update RLS policies to allow users with is_reviewer=true
-- to read all profiles, not just users with role='admin'

BEGIN;

-- Create a function that checks for both reviewer and admin
CREATE OR REPLACE FUNCTION public.is_admin_or_reviewer()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin_or_reviewer() TO authenticated;

-- Drop the old policy that only checked is_admin()
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- Create new policy that checks for both admin and reviewer
CREATE POLICY "Admins and reviewers can read all profiles"
ON public.profiles FOR SELECT
USING (public.is_admin_or_reviewer());

-- Also update the update policy to use the new function
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins and reviewers can update all profiles"
ON public.profiles FOR UPDATE
USING (public.is_admin_or_reviewer());

COMMENT ON FUNCTION public.is_admin_or_reviewer IS 'Returns true if the current user has admin role or is_reviewer flag';

COMMIT;





