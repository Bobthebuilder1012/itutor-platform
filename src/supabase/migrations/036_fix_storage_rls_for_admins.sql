-- =====================================================
-- FIX STORAGE RLS TO USE SECURITY DEFINER FUNCTION
-- =====================================================
-- The storage policies need to use the same helper function
-- we created in migration 034 to avoid RLS recursion issues

-- Update Policy 3: Admins can read all verification documents
DROP POLICY IF EXISTS "Admins read all verification documents" ON storage.objects;
CREATE POLICY "Admins read all verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND is_admin_or_reviewer(auth.uid())
);

-- Update Policy 4: Admins can delete verification documents
DROP POLICY IF EXISTS "Admins delete verification documents" ON storage.objects;
CREATE POLICY "Admins delete verification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Storage RLS policies updated!';
  RAISE NOTICE '✅ Admins and reviewers can now read/delete verification documents';
END $$;

