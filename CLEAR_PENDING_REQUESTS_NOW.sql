-- =====================================================
-- CLEAR ALL PENDING VERIFICATION REQUESTS
-- =====================================================
-- Run this to let tutors submit new verification requests

-- Clear ALL pending requests
UPDATE tutor_verification_requests
SET 
  status = 'REJECTED',
  reviewer_reason = 'Request cleared by admin to allow resubmission',
  reviewed_at = NOW()
WHERE status IN ('SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW');

-- Show what was cleared
SELECT 
  'Cleared ' || COUNT(*) || ' pending requests' as result
FROM tutor_verification_requests
WHERE reviewer_reason = 'Request cleared by admin to allow resubmission';

-- Show all verification requests by status
SELECT 
  status,
  COUNT(*) as count
FROM tutor_verification_requests
GROUP BY status
ORDER BY status;






