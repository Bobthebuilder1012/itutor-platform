-- Run this in Supabase SQL Editor to check if subjects exist

-- 1. Check if subjects table has any data
SELECT COUNT(*) as total_subjects FROM public.subjects;

-- 2. List all subjects (first 20)
SELECT id, name, curriculum, level, code 
FROM public.subjects 
ORDER BY curriculum, name
LIMIT 20;

-- 3. Check RLS policies on subjects table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'subjects';

-- 4. If no subjects exist, run this to seed them:
-- (Copy and paste the INSERT statements from src/supabase/migrations/006_enable_extensions_and_seed_subjects.sql)









