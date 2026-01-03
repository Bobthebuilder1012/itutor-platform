-- =====================================================
-- FIX SUBJECTS WITH NULL CURRICULUM OR LEVEL
-- =====================================================

-- Step 1: Check for subjects with NULL curriculum or level
SELECT 
  id, 
  name, 
  curriculum, 
  level,
  code,
  created_at
FROM public.subjects 
WHERE curriculum IS NULL OR level IS NULL
ORDER BY created_at DESC;

-- Step 2: Count how many subjects have NULL values
SELECT 
  COUNT(*) FILTER (WHERE curriculum IS NULL) as null_curriculum_count,
  COUNT(*) FILTER (WHERE level IS NULL) as null_level_count,
  COUNT(*) as total_subjects
FROM public.subjects;

-- Step 3: Delete subjects with NULL curriculum or level
-- UNCOMMENT THE LINE BELOW TO DELETE
-- DELETE FROM public.subjects WHERE curriculum IS NULL OR level IS NULL;

-- Step 4: Verify all subjects now have values
SELECT 
  COUNT(*) as subjects_with_valid_data
FROM public.subjects 
WHERE curriculum IS NOT NULL AND level IS NOT NULL;

-- Step 5: Re-seed subjects if needed
-- Run the seed script from: src/supabase/migrations/006_enable_extensions_and_seed_subjects.sql







