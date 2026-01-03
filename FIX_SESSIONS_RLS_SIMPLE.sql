-- Simple RLS fix for sessions table
-- Run this if the previous script didn't work

-- First, check if policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'sessions';

-- If you see 0 results, continue with the rest of this script:

-- Drop any existing policies (in case there are partial ones)
DROP POLICY IF EXISTS "Students can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can update their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role has full access to sessions" ON public.sessions;

-- Create policies
CREATE POLICY "Students can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Tutors can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can update their own sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Service role has full access to sessions"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify policies were created
SELECT policyname FROM pg_policies WHERE tablename = 'sessions';






