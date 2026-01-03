-- =====================================================
-- FIX RLS FOR ADMIN TO VIEW VERIFICATION REQUESTS
-- =====================================================

-- Check current RLS policies on tutor_verification_requests
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'tutor_verification_requests'
ORDER BY policyname;

-- Add policy for admins to view all verification requests
-- (This updates the existing reviewer policy to include admins with role='admin')
DROP POLICY IF EXISTS "Admins view all verification requests" ON tutor_verification_requests;
CREATE POLICY "Admins view all verification requests"
ON tutor_verification_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Also ensure admins can update verification requests
DROP POLICY IF EXISTS "Admins update verification requests" ON tutor_verification_requests;
CREATE POLICY "Admins update verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies updated for tutor_verification_requests';
  RAISE NOTICE '✅ Admins with is_reviewer=true or role=admin can now view and update requests';
END $$;






