-- Check the actual schema of the profiles table
-- This will show you all column names and their types
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- Show first 5 rows with all columns to see the actual data structure
SELECT *
FROM profiles
LIMIT 5;
