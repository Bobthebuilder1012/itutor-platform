-- Clean up duplicate/conflicting policies and create correct ones

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Service role full access" ON public.sessions;
DROP POLICY IF EXISTS "Service role has full access to sessions" ON public.sessions;
DROP POLICY IF EXISTS "Students can view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Students can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Students can view their sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can view their sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can update their own sessions" ON public.sessions;

-- Create clean policies with correct roles

-- 1. Students can view their own sessions
CREATE POLICY "students_view_own_sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- 2. Tutors can view their own sessions
CREATE POLICY "tutors_view_own_sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- 3. Tutors can update their own sessions (for marking no-show)
CREATE POLICY "tutors_update_own_sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- 4. Service role has full access (for API routes)
CREATE POLICY "service_role_all_access"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify - should see exactly 4 policies
SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'sessions' ORDER BY policyname;




