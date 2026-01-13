-- =====================================================
-- DEBUG SUBJECTS FETCH ISSUE
-- =====================================================

-- 1. Check if RLS is enabled on subjects table
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'subjects';

-- 2. Check what RLS policies exist on subjects table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'subjects'
ORDER BY policyname;

-- 3. Test fetching subjects by label (simulate the query from tutor onboarding)
-- This should work for authenticated users
SELECT id, label
FROM subjects
WHERE label IN ('CAPE Applied Mathematics', 'CAPE Computer Science', 'CSEC Mathematics')
LIMIT 5;

-- 4. Check if there are any subjects without labels
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN label IS NULL OR label = '' THEN 1 END) as missing_labels
FROM subjects;

-- 5. Show sample labels to help debug
SELECT 
  id,
  name,
  curriculum,
  label
FROM subjects
WHERE curriculum IN ('CSEC', 'CAPE')
  AND name ILIKE '%computer%'
ORDER BY curriculum, name;


