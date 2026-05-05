-- =====================================================
-- ALLOW TUTORS TO UPDATE FILE PATH
-- =====================================================
-- Tutors need to update the file_path field after uploading
-- Currently they can only INSERT but not UPDATE their own requests

-- Add policy: Tutors can UPDATE their own verification requests (for file_path)
DROP POLICY IF EXISTS "Tutors update own verification requests" ON tutor_verification_requests;
CREATE POLICY "Tutors update own verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policy added: Tutors can now update their own verification requests';
  RAISE NOTICE '✅ This allows tutors to update file_path after uploading documents';
END $$;












