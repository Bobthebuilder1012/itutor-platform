-- =====================================================
-- FIX RLS POLICIES FOR RATINGS TABLE
-- Allow students to view ratings for tutors
-- =====================================================

-- Check if RLS is enabled on ratings table
SELECT 
    schemaname, 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'ratings';

-- Check current policies
SELECT 
    policyname,
    cmd,
    qual::text as using_expression
FROM pg_policies
WHERE tablename = 'ratings';

-- Drop existing policies if they're too restrictive
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'ratings'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.ratings';
    END LOOP;
END $$;

-- =====================================================
-- CREATE NEW POLICIES
-- =====================================================

-- 1. Allow students to view all ratings (needed for tutor profiles)
CREATE POLICY "Anyone can view ratings"
ON public.ratings
FOR SELECT
TO authenticated
USING (true);

-- 2. Allow students to insert their own ratings (for tutors they've had sessions with)
CREATE POLICY "Students can create ratings for their tutors"
ON public.ratings
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
        SELECT 1 FROM public.sessions
        WHERE sessions.student_id = auth.uid()
        AND sessions.tutor_id = ratings.tutor_id
        AND sessions.status = 'completed'
    )
);

-- 3. Allow students to update their own ratings
CREATE POLICY "Students can update their own ratings"
ON public.ratings
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

-- 4. Allow students to delete their own ratings
CREATE POLICY "Students can delete their own ratings"
ON public.ratings
FOR DELETE
TO authenticated
USING (auth.uid() = student_id);

-- 5. Allow tutors to view ratings about themselves
CREATE POLICY "Tutors can view their own ratings"
ON public.ratings
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

-- Verify the new policies
SELECT 
    policyname,
    cmd,
    qual::text as using_expression,
    with_check::text as with_check_expression
FROM pg_policies
WHERE tablename = 'ratings'
ORDER BY policyname;

-- Test query: Check if ratings are accessible
SELECT 
    r.id,
    r.tutor_id,
    r.student_id,
    r.stars,
    r.comment,
    r.created_at
FROM public.ratings r
LIMIT 5;







