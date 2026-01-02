-- Fix RLS policies for sessions table
-- This allows students and tutors to view their own sessions

-- Enable RLS on the table (if not already enabled)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Students can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Students can insert their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Tutors can update their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role has full access to sessions" ON public.sessions;

-- Policy: Students can view their own sessions
CREATE POLICY "Students can view their own sessions"
ON public.sessions
FOR SELECT
USING (
  student_id = auth.uid()
);

-- Policy: Tutors can view their own sessions
CREATE POLICY "Tutors can view their own sessions"
ON public.sessions
FOR SELECT
USING (
  tutor_id = auth.uid()
);

-- Policy: Tutors can update their own sessions (for marking no-show)
CREATE POLICY "Tutors can update their own sessions"
ON public.sessions
FOR UPDATE
USING (
  tutor_id = auth.uid()
)
WITH CHECK (
  tutor_id = auth.uid()
);

-- Policy: Service role has full access (for API routes)
CREATE POLICY "Service role has full access to sessions"
ON public.sessions
FOR ALL
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'sessions'
ORDER BY policyname;




