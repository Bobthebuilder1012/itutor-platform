-- Check if the file exists in storage and what the path is

-- 1. Check the file_path in the latest verification request
SELECT 
  id,
  tutor_id,
  file_path,
  original_filename,
  status,
  created_at
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check what files exist in storage (if any)
-- Note: You may need to run this in the Supabase Dashboard under Storage > tutor-verifications
-- Or check the storage.objects table directly:

SELECT 
  id,
  name,
  bucket_id,
  created_at
FROM storage.objects
WHERE bucket_id = 'tutor-verifications'
ORDER BY created_at DESC
LIMIT 10;






