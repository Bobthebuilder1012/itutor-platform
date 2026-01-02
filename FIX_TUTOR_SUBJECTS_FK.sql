-- =====================================================
-- FIX TUTOR_SUBJECTS FOREIGN KEY RELATIONSHIP
-- =====================================================
-- Ensures the tutor_subjects table has proper foreign key to subjects table

-- Check if the foreign key exists
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'tutor_subjects' 
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'subject_id';

-- If the above query returns no results, run this to add the foreign key:
-- (Comment out if the FK already exists)

ALTER TABLE public.tutor_subjects
DROP CONSTRAINT IF EXISTS tutor_subjects_subject_id_fkey;

ALTER TABLE public.tutor_subjects
ADD CONSTRAINT tutor_subjects_subject_id_fkey 
FOREIGN KEY (subject_id) 
REFERENCES public.subjects(id) 
ON DELETE RESTRICT;

-- Verify it was added
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'tutor_subjects' 
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'subject_id';

SELECT '✅ Foreign key relationship verified/created!' AS status;
