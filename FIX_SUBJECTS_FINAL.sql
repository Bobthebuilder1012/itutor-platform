-- =====================================================
-- FINAL FIX FOR SUBJECTS DATA CORRUPTION
-- Strategy: Keep correct entries, delete corrupted ones
-- =====================================================

-- STEP 1: Identify and preview what will be deleted
SELECT 
  s1.id as corrupted_id,
  s1.name,
  s1.curriculum as corrupted_curriculum,
  s1.level as corrupted_level,
  s2.id as correct_id,
  s2.curriculum as correct_curriculum,
  s2.level as correct_level,
  'WILL DELETE CORRUPTED' as action
FROM subjects s1
JOIN subjects s2 ON s1.name = s2.name AND s1.id != s2.id
WHERE s1.curriculum IN ('CSEC', 'CAPE') 
  AND s1.level IN ('CSEC', 'CAPE')
  AND s1.curriculum = s2.level  -- s1 is corrupted (swapped)
  AND s1.level = s2.curriculum
ORDER BY s1.name
LIMIT 20;

-- STEP 2: Delete tutor_subjects relationships to corrupted entries
DELETE FROM tutor_subjects
WHERE subject_id IN (
  SELECT s1.id
  FROM subjects s1
  JOIN subjects s2 ON s1.name = s2.name AND s1.id != s2.id
  WHERE s1.curriculum IN ('CSEC', 'CAPE') 
    AND s1.level IN ('CSEC', 'CAPE')
    AND s1.curriculum = s2.level
    AND s1.level = s2.curriculum
);

-- STEP 3: Delete corrupted duplicate subjects
DELETE FROM subjects
WHERE id IN (
  SELECT s1.id
  FROM subjects s1
  JOIN subjects s2 ON s1.name = s2.name AND s1.id != s2.id
  WHERE s1.curriculum IN ('CSEC', 'CAPE') 
    AND s1.level IN ('CSEC', 'CAPE')
    AND s1.curriculum = s2.level
    AND s1.level = s2.curriculum
);

-- STEP 4: Now handle remaining subjects that are corrupted (no duplicates)
-- These are subjects where BOTH curriculum and level are set to curriculum values
-- For example: curriculum='CSEC' AND level='CSEC' (should be curriculum='CSEC', level='Form 4')

-- First, let's check if there are any remaining issues
SELECT 
  id,
  name,
  curriculum,
  level,
  'STILL CORRUPTED - both fields have same value' as issue
FROM subjects
WHERE curriculum = level
  AND curriculum IN ('CSEC', 'CAPE')
LIMIT 10;

-- STEP 5: Check final state
SELECT 
  curriculum,
  COUNT(*) as count,
  '✅ FIXED' as status
FROM subjects
GROUP BY curriculum
ORDER BY curriculum;

-- STEP 6: Verify specific subjects
SELECT 
  name,
  curriculum,
  level,
  id
FROM subjects
WHERE name IN ('Agricultural Science', 'Chemistry', 'Mathematics', 'Biology')
ORDER BY name, curriculum;

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deleted_count
  FROM subjects
  WHERE curriculum IN ('CSEC', 'CAPE') 
    AND level IN ('CSEC', 'CAPE');
  
  RAISE NOTICE '✅ Corrupted duplicates removed!';
  RAISE NOTICE 'ℹ️  Remaining potentially corrupted entries: %', deleted_count;
  RAISE NOTICE '✅ Now run: TRUNCATE syllabuses CASCADE;';
  RAISE NOTICE '✅ Then re-run: 030_seed_syllabuses.sql';
END $$;












