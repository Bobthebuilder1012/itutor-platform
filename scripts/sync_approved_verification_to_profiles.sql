-- =====================================================
-- SYNC APPROVED VERIFICATION REQUESTS TO PROFILES
-- =====================================================
-- One-time fix: Set tutor_verification_status = 'VERIFIED' for all tutors
-- who have an APPROVED verification request but profile not yet VERIFIED.
-- Run this in Supabase SQL Editor.

-- Preview: See which tutors will be updated
SELECT
  p.id AS profile_id,
  p.full_name,
  p.email,
  p.tutor_verification_status AS current_status,
  p.tutor_verified_at AS current_verified_at,
  tvr.id AS request_id,
  tvr.reviewed_at AS approval_date
FROM profiles p
JOIN tutor_verification_requests tvr ON tvr.tutor_id = p.id
WHERE tvr.status = 'APPROVED'
  AND p.role = 'tutor'
  AND (p.tutor_verification_status IS DISTINCT FROM 'VERIFIED' OR p.tutor_verified_at IS NULL)
ORDER BY tvr.reviewed_at DESC;

-- Apply: Update profiles to VERIFIED where they have an approved request
UPDATE profiles p
SET
  tutor_verification_status = 'VERIFIED',
  tutor_verified_at = COALESCE(tvr.reviewed_at, tvr.updated_at, tvr.created_at)
FROM tutor_verification_requests tvr
WHERE tvr.tutor_id = p.id
  AND tvr.status = 'APPROVED'
  AND p.role = 'tutor'
  AND (p.tutor_verification_status IS DISTINCT FROM 'VERIFIED' OR p.tutor_verified_at IS NULL);

-- Verify: Count how many were updated (run after the UPDATE)
-- SELECT COUNT(*) FROM profiles WHERE role = 'tutor' AND tutor_verification_status = 'VERIFIED';
