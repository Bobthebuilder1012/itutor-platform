-- =====================================================
-- VERIFICATION STORAGE BUCKET & POLICIES
-- =====================================================
-- Storage bucket for tutor verification documents (CXC results slips)
-- Path: {tutor_id}/requests/{request_id}.{ext}

-- 1. CREATE STORAGE BUCKET (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutor-verifications', 'tutor-verifications', false)
ON CONFLICT (id) DO NOTHING;

-- 2. STORAGE POLICIES

-- Policy 1: Tutors can upload to their own folder
DROP POLICY IF EXISTS "Tutors upload own verification documents" ON storage.objects;
CREATE POLICY "Tutors upload own verification documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tutor-verifications' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Tutors can read their own documents
DROP POLICY IF EXISTS "Tutors read own verification documents" ON storage.objects;
CREATE POLICY "Tutors read own verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Admins can read all verification documents
DROP POLICY IF EXISTS "Admins read all verification documents" ON storage.objects;
CREATE POLICY "Admins read all verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 4: Admins can delete verification documents
DROP POLICY IF EXISTS "Admins delete verification documents" ON storage.objects;
CREATE POLICY "Admins delete verification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Storage bucket tutor-verifications configured';
  RAISE NOTICE '✅ Storage policies applied (tutors upload/read own, admins read/delete all)';
  RAISE NOTICE '✅ Path format: {tutor_id}/requests/{request_id}.{ext}';
END $$;












