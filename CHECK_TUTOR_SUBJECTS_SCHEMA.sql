-- =====================================================
-- CHECK TUTOR_SUBJECTS TABLE SCHEMA
-- =====================================================
-- This shows the actual structure of the tutor_subjects table

-- Show all columns in tutor_subjects table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'tutor_subjects'
ORDER BY ordinal_position;

-- Show constraints and foreign keys
SELECT 
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'tutor_subjects'
ORDER BY tc.constraint_type, tc.constraint_name;

-- Sample data (if any exists)
SELECT * FROM public.tutor_subjects LIMIT 5;






