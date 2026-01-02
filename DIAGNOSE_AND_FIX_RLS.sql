-- =====================================================
-- DIAGNOSE AND FIX RLS ISSUES
-- =====================================================

-- Step 1: Check if RLS is enabled on profiles
SELECT 
    schemaname, 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'profiles';

-- Step 2: See current RLS policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual::text as using_expression
FROM pg_policies
WHERE tablename = 'profiles';

-- Step 3: Count tutors (as superuser, should see all)
SELECT COUNT(*) as total_tutors
FROM public.profiles
WHERE role = 'tutor';

-- Step 4: List all tutors with their subjects
SELECT 
    p.id,
    p.username,
    p.display_name,
    p.full_name,
    p.email,
    p.role,
    COUNT(ts.id) as subject_count
FROM public.profiles p
LEFT JOIN public.tutor_subjects ts ON p.id = ts.tutor_id
WHERE p.role = 'tutor'
GROUP BY p.id, p.username, p.display_name, p.full_name, p.email, p.role;

-- =====================================================
-- FIX: Create proper RLS policies
-- =====================================================

-- Temporarily disable RLS to test (REMOVE THIS AFTER TESTING)
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- OR: Fix the policies properly

-- Drop all existing policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.profiles';
    END LOOP;
END $$;

-- Create comprehensive policies

-- 1. Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2. Everyone can view tutor profiles (important for Find Tutors page!)
CREATE POLICY "Tutor profiles are public"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'tutor');

-- 3. Tutors can view their students' profiles
CREATE POLICY "Tutors can view student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    role = 'student' 
    AND EXISTS (
        SELECT 1 FROM public.sessions 
        WHERE sessions.student_id = profiles.id 
        AND sessions.tutor_id = auth.uid()
    )
);

-- 4. Parents can view their children's profiles
CREATE POLICY "Parents can view their children"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    role = 'student' 
    AND EXISTS (
        SELECT 1 FROM public.parent_child_links 
        WHERE child_id = profiles.id 
        AND parent_id = auth.uid()
    )
);

-- 5. Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6. Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Verify the new policies
SELECT 
    policyname,
    cmd,
    qual::text as using_expression,
    with_check::text as with_check_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;





