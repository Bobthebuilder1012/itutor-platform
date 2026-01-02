-- =====================================================
-- CHECK REVIEWER SETUP AND VERIFICATION REQUESTS
-- =====================================================

-- 1. Check if reviewer account exists and is properly configured
SELECT 
    id,
    email,
    full_name,
    role,
    is_reviewer,
    created_at
FROM profiles
WHERE is_reviewer = true;

-- If this returns no rows, you need to set is_reviewer = true for your account

-- 2. Check all verification requests
SELECT 
    id,
    tutor_id,
    status,
    file_path,
    original_filename,
    file_type,
    system_recommendation,
    confidence_score,
    created_at
FROM tutor_verification_requests
ORDER BY created_at DESC;

-- 3. Check if any files exist in storage
SELECT 
    id,
    name,
    bucket_id,
    owner,
    created_at
FROM storage.objects
WHERE bucket_id = 'verification_uploads'
ORDER BY created_at DESC;

-- 4. Get the reviewer account ID (replace with your actual reviewer email)
-- Example: SELECT id FROM profiles WHERE email = 'reviewer@example.com';




