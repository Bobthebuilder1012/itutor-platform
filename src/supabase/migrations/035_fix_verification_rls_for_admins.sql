-- =====================================================
-- FIX VERIFICATION RLS TO INCLUDE ADMINS
-- =====================================================
-- The existing policy only checks is_reviewer=true
-- This adds support for role='admin' as well

-- Update Policy 3: Reviewers AND Admins can view ALL verification requests
-- Uses the is_admin_or_reviewer() helper from migration 034
DROP POLICY IF EXISTS "Reviewers view all verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers view all verification requests"
ON tutor_verification_requests FOR SELECT
TO authenticated
USING (
  is_admin_or_reviewer(auth.uid())
);

-- Update Policy 4: Reviewers AND Admins can update verification requests
DROP POLICY IF EXISTS "Reviewers update verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers update verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (
  is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Verification RLS policies updated!';
  RAISE NOTICE '✅ Users with is_reviewer=true OR role=admin can now view/update verification requests';
END $$;

