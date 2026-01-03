-- =====================================================
-- COMPLETE FIX FOR VERIFICATION STORAGE BUCKET
-- =====================================================

-- Step 1: Drop bucket if it exists (to start fresh)
DELETE FROM storage.buckets WHERE id = 'verification_uploads';

-- Step 2: Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification_uploads', 
  'verification_uploads', 
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']
);

-- Step 3: Verify bucket was created
DO $$
DECLARE
    bucket_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'verification_uploads'
    ) INTO bucket_exists;
    
    IF bucket_exists THEN
        RAISE NOTICE '✅ Bucket "verification_uploads" created successfully!';
    ELSE
        RAISE EXCEPTION '❌ Failed to create bucket';
    END IF;
END $$;

-- Step 4: Check current verification requests
SELECT 
    COUNT(*) as total_requests,
    COUNT(file_path) as requests_with_files
FROM tutor_verification_requests;

RAISE NOTICE '';
RAISE NOTICE '⚠️  IMPORTANT: You must now create RLS policies via Dashboard UI:';
RAISE NOTICE '   1. Go to Storage → verification_uploads → Policies';
RAISE NOTICE '   2. Create policy for reviewers to read all files';
RAISE NOTICE '   3. Create policy for tutors to manage own files';
RAISE NOTICE '';
RAISE NOTICE 'See SETUP_VERIFICATION_STORAGE_POLICIES.md for exact policy SQL';







