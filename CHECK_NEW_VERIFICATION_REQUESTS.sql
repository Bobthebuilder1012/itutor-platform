-- =====================================================
-- CHECK ALL VERIFICATION REQUESTS
-- =====================================================
-- See what requests exist and their status

-- Show ALL verification requests (most recent first)
SELECT 
  tvr.id,
  tvr.tutor_id,
  p.full_name as tutor_name,
  p.email as tutor_email,
  tvr.status,
  tvr.file_type,
  tvr.file_path,
  tvr.created_at,
  tvr.reviewed_at,
  tvr.reviewer_decision
FROM tutor_verification_requests tvr
LEFT JOIN profiles p ON p.id = tvr.tutor_id
ORDER BY tvr.created_at DESC
LIMIT 20;

-- Count by status
SELECT 
  status,
  COUNT(*) as count
FROM tutor_verification_requests
GROUP BY status
ORDER BY status;

-- Check if the newest request has a file_path
SELECT 
  id,
  tutor_id,
  status,
  file_path IS NOT NULL as has_file_path,
  file_path,
  created_at
FROM tutor_verification_requests
ORDER BY created_at DESC
LIMIT 5;











