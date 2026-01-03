-- =====================================================
-- SET VERIFIED SUBJECTS TO PUBLIC BY DEFAULT
-- =====================================================
-- Changes default behavior so verified subjects are visible
-- by default when admin adds them. Tutors can still hide
-- them later if needed.

-- 1. Update all existing hidden subjects to be public
UPDATE tutor_verified_subjects
SET 
  is_public = true,
  visibility_updated_at = now()
WHERE is_public = false;

-- 2. Change the default value for future inserts
ALTER TABLE tutor_verified_subjects 
ALTER COLUMN is_public SET DEFAULT true;

-- 3. Verify the change
SELECT 
  COUNT(*) as total_subjects,
  COUNT(*) FILTER (WHERE is_public = true) as public_subjects,
  COUNT(*) FILTER (WHERE is_public = false) as hidden_subjects
FROM tutor_verified_subjects;





