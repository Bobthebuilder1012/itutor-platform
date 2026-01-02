-- =====================================================
-- CHECK AND CLEAR STUCK PENDING VERIFICATION REQUESTS
-- =====================================================

-- 1. Check all pending verification requests
SELECT 
  tvr.id,
  tvr.tutor_id,
  p.full_name,
  p.email,
  tvr.status,
  tvr.created_at,
  EXTRACT(DAY FROM (NOW() - tvr.created_at)) as days_pending
FROM tutor_verification_requests tvr
JOIN profiles p ON p.id = tvr.tutor_id
WHERE tvr.status IN ('SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW')
ORDER BY tvr.created_at DESC;

-- 2. Clear old pending requests (older than 7 days) - OPTIONAL
-- Uncomment to run:
/*
UPDATE tutor_verification_requests
SET 
  status = 'REJECTED',
  reviewer_reason = 'Request expired - no action taken after 7 days',
  reviewed_at = NOW()
WHERE status IN ('SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW')
AND created_at < NOW() - INTERVAL '7 days';
*/

-- 3. Clear ALL pending requests (use if tutors are stuck) - OPTIONAL
-- Uncomment to run:
/*
UPDATE tutor_verification_requests
SET 
  status = 'REJECTED',
  reviewer_reason = 'Request cleared by admin',
  reviewed_at = NOW()
WHERE status IN ('SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW');
*/

-- 4. Check results
SELECT 
  status,
  COUNT(*) as count
FROM tutor_verification_requests
GROUP BY status
ORDER BY status;



