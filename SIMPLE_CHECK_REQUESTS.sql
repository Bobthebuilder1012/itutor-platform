-- Simple check - what verification requests exist?

SELECT 
  id,
  tutor_id,
  status,
  created_at,
  file_type,
  original_filename
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 10;












