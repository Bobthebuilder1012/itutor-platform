-- Check the subjects table schema and constraints
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.subjects'::regclass
AND contype = 'c';  -- Check constraints only

-- Also check the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subjects'
ORDER BY ordinal_position;


