-- =====================================================
-- CHECK IF STUDENTS CAN SEE TUTORS (RLS PERMISSIONS)
-- =====================================================

-- 1. Check RLS status on profiles table
SELECT 
  schemaname, 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'profiles';

-- 2. Check what RLS policies exist for profiles
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
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 3. Check if there's a policy that allows students to read tutor profiles
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'profiles'
  AND cmd = 'SELECT'
  AND (
    qual LIKE '%tutor%' 
    OR qual LIKE '%student%'
    OR qual LIKE '%public%'
    OR policyname LIKE '%read%'
    OR policyname LIKE '%view%'
  );

-- 4. Test: Can we see tutor profiles? (Run this as a student user)
SELECT COUNT(*) as tutor_count
FROM profiles
WHERE role = 'tutor';

-- If the count above is 0, then students CAN'T see tutors due to RLS
-- Solution: Add a policy to allow students to read tutor profiles
