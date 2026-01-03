-- =====================================================
-- DIAGNOSE STORAGE BUCKET ISSUE
-- =====================================================

-- 1. Check if bucket exists
SELECT 
    id, 
    name, 
    public, 
    file_size_limit,
    allowed_mime_types,
    created_at
FROM storage.buckets 
WHERE id = 'verification_uploads';

-- If this returns nothing, the bucket doesn't exist

-- 2. Check verification requests and their file paths
SELECT 
    id,
    tutor_id,
    status,
    file_path,
    original_filename,
    file_type,
    created_at
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check if any files actually exist in the bucket
SELECT 
    id,
    name,
    bucket_id,
    owner,
    created_at,
    metadata
FROM storage.objects 
WHERE bucket_id = 'verification_uploads'
LIMIT 10;

-- 4. Check storage policies
SELECT 
    id,
    name,
    bucket_id,
    definition
FROM storage.policies
WHERE bucket_id = 'verification_uploads';

-- Run all 4 queries and share the results






