-- =====================================================
-- FIX TUTOR_SUBJECTS RLS - ALTERNATIVE APPROACH
-- =====================================================

-- Option 1: Temporarily disable RLS to test if that's the issue
-- (DO THIS FIRST TO TEST)
ALTER TABLE public.tutor_subjects DISABLE ROW LEVEL SECURITY;

-- After testing, re-enable with better policies:
-- ALTER TABLE public.tutor_subjects ENABLE ROW LEVEL SECURITY;

-- Option 2: If you want to keep RLS enabled, use service role policies
-- Drop all existing policies
DROP POLICY IF EXISTS "Anyone can view tutor subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can insert their own subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can update their own subjects" ON public.tutor_subjects;
DROP POLICY IF EXISTS "Tutors can delete their own subjects" ON public.tutor_subjects;

-- Create permissive policies that check both auth.uid() and profile role
CREATE POLICY "Enable read access for all users"
ON public.tutor_subjects
FOR SELECT
USING (true);

CREATE POLICY "Enable insert for authenticated tutors"
ON public.tutor_subjects
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.id = tutor_subjects.tutor_id
        AND profiles.role = 'tutor'
    )
);

CREATE POLICY "Enable update for authenticated tutors"
ON public.tutor_subjects
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.id = tutor_subjects.tutor_id
        AND profiles.role = 'tutor'
    )
);

CREATE POLICY "Enable delete for authenticated tutors"
ON public.tutor_subjects
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.id = tutor_subjects.tutor_id
        AND profiles.role = 'tutor'
    )
);

-- Verify
SELECT 
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies
WHERE tablename = 'tutor_subjects'
ORDER BY cmd, policyname;





