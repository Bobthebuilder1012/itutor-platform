-- =====================================================
-- FIX SUBJECTS LABELS - Add Labels to Existing Subjects
-- =====================================================
-- This fixes the "Error finding selected subjects" issue
-- by ensuring all subjects have proper labels

BEGIN;

-- Update subjects to have labels if they're missing
-- Format: "Subject Name (CURRICULUM Level)"

UPDATE subjects
SET label = CASE 
  -- CSEC subjects
  WHEN curriculum = 'CSEC' THEN name || ' (CSEC)'
  -- CAPE subjects with Unit info
  WHEN curriculum = 'CAPE' AND name LIKE '%Unit 1%' THEN 
    REPLACE(name, 'Unit 1', '') || ' (CAPE Unit 1)'
  WHEN curriculum = 'CAPE' AND name LIKE '%Unit 2%' THEN 
    REPLACE(name, 'Unit 2', '') || ' (CAPE Unit 2)'
  -- CAPE subjects without Unit in name
  WHEN curriculum = 'CAPE' THEN name || ' (CAPE)'
  -- Fallback
  ELSE name || ' (' || curriculum || ')'
END
WHERE label IS NULL OR label = '';

-- Verify the update
SELECT 
  'Fix Applied' as status,
  COUNT(*) as total_subjects,
  COUNT(label) as subjects_with_labels,
  COUNT(*) - COUNT(label) as still_missing_labels
FROM subjects;

-- Show some examples
SELECT 
  name,
  curriculum,
  level,
  label
FROM subjects
WHERE label IS NOT NULL
ORDER BY curriculum, name
LIMIT 10;

COMMIT;

-- After running this, try the onboarding again!

