-- =====================================================
-- RE-ENABLE RLS WITH WORKING POLICIES
-- =====================================================

-- Re-enable RLS
ALTER TABLE public.tutor_subjects ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Enable insert for authenticated tutors" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Enable update for authenticated tutors" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Enable delete for authenticated tutors" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Anyone can view tutor subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can insert their own subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can update their own subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can delete their own subjects" ON public.tutor_subjects;

-- Simple working policies
-- 1. Anyone can read tutor subjects (for student search)
CREATE POLICY "tutor_subjects_select_policy"
ON public.tutor_subjects
FOR SELECT
USING (true);

-- 2. Authenticated users can insert their own tutor subjects
CREATE POLICY "tutor_subjects_insert_policy"
ON public.tutor_subjects
FOR INSERT
WITH CHECK (auth.uid() = tutor_id);

-- 3. Users can update their own tutor subjects
CREATE POLICY "tutor_subjects_update_policy"
ON public.tutor_subjects
FOR UPDATE
USING (auth.uid() = tutor_id);

-- 4. Users can delete their own tutor subjects
CREATE POLICY "tutor_subjects_delete_policy"
ON public.tutor_subjects
FOR DELETE
USING (auth.uid() = tutor_id);

-- Verify the policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies
WHERE tablename = 'tutor_subjects'
ORDER BY cmd, policyname;








