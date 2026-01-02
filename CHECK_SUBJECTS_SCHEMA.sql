-- =====================================================
-- CHECK AND FIX SUBJECTS TABLE SCHEMA
-- =====================================================

-- Step 1: Check if subjects table exists and view its columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subjects'
ORDER BY ordinal_position;

-- Step 2: Check if curriculum column exists
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'subjects' 
    AND column_name = 'curriculum'
) as curriculum_exists;

-- Step 3: Count subjects
SELECT COUNT(*) as total_subjects FROM public.subjects;

-- Step 4: Sample some subjects to see structure
SELECT * FROM public.subjects LIMIT 5;

-- =====================================================
-- IF CURRICULUM COLUMN IS MISSING, RUN THIS:
-- =====================================================

-- Add curriculum column if it doesn't exist
-- UNCOMMENT THE LINES BELOW IF NEEDED:

-- ALTER TABLE public.subjects 
-- ADD COLUMN IF NOT EXISTS curriculum text;

-- ALTER TABLE public.subjects 
-- ADD COLUMN IF NOT EXISTS level text;

-- ALTER TABLE public.subjects 
-- ADD CONSTRAINT check_curriculum 
-- CHECK (curriculum IN ('CSEC', 'CAPE'));

-- Update existing records with default values if they're NULL
-- UPDATE public.subjects 
-- SET curriculum = 'CSEC' 
-- WHERE curriculum IS NULL;

-- UPDATE public.subjects 
-- SET level = 'Form 4-5' 
-- WHERE level IS NULL;





