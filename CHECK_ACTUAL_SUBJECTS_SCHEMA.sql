-- =====================================================
-- CHECK ACTUAL SUBJECTS TABLE SCHEMA
-- =====================================================

-- View all columns in the subjects table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subjects'
ORDER BY ordinal_position;








