-- =====================================================
-- ALLOW ADMINS TO UPDATE VERIFICATION STATUS
-- =====================================================
-- Adds helper function and RLS policy so admins can revoke/update tutor verification status

-- 1. Create helper function to check if user is admin/reviewer
-- Using SECURITY DEFINER to bypass RLS and avoid infinite recursion
CREATE OR REPLACE FUNCTION is_admin_or_reviewer(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND (is_reviewer = true OR role = 'admin')
  );
END;
$$;

-- 2. Policy: Admins/Reviewers can update tutor_verification_status and tutor_verified_at
DROP POLICY IF EXISTS "Admins update tutor verification status" ON profiles;
CREATE POLICY "Admins update tutor verification status"
ON profiles FOR UPDATE
TO authenticated
USING (
  -- User is updating their own profile OR user is admin/reviewer
  id = auth.uid() 
  OR is_admin_or_reviewer(auth.uid())
)
WITH CHECK (
  -- User is updating their own profile OR user is admin/reviewer
  id = auth.uid() 
  OR is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Helper function created: is_admin_or_reviewer()';
  RAISE NOTICE '✅ RLS policy added: Admins can now update tutor verification status';
  RAISE NOTICE '✅ Admins with is_reviewer=true or role=admin can update profiles';
END $$;

