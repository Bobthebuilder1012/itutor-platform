-- COMPLETE FIX FOR PARENT SESSIONS ISSUE

-- Step 1: First, let's ensure RLS is enabled on sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on sessions to start fresh
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'sessions' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.sessions', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- Step 3: Create fresh RLS policies

-- Students can view their own sessions
CREATE POLICY "Students can view their own sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- Students can update their own sessions
CREATE POLICY "Students can update their own sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (student_id = auth.uid());

-- Tutors can view their sessions
CREATE POLICY "Tutors can view their sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can update their sessions
CREATE POLICY "Tutors can update their sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can insert sessions (for session creation)
CREATE POLICY "Tutors can create sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

-- SERVICE ROLE (backend) can do everything
CREATE POLICY "Service role can manage all sessions"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- PARENTS can view their children's sessions
CREATE POLICY "Parents can view children sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (
    student_id IN (
        SELECT child_id 
        FROM public.parent_child_links 
        WHERE parent_id = auth.uid()
    )
);

-- PARENTS can update their children's sessions (for reschedule/cancel)
CREATE POLICY "Parents can update children sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (
    student_id IN (
        SELECT child_id 
        FROM public.parent_child_links 
        WHERE parent_id = auth.uid()
    )
);

-- Step 4: Verify policies were created
SELECT 
    'RLS Policies on sessions table' as info,
    policyname,
    cmd as operation,
    CASE 
        WHEN cmd = 'SELECT' THEN 'SELECT policy'
        WHEN cmd = 'INSERT' THEN 'INSERT policy'
        WHEN cmd = 'UPDATE' THEN 'UPDATE policy'
        WHEN cmd = 'DELETE' THEN 'DELETE policy'
        WHEN cmd = 'ALL' THEN 'ALL operations'
        ELSE cmd
    END as policy_type
FROM pg_policies 
WHERE tablename = 'sessions' 
AND schemaname = 'public'
ORDER BY policyname;

-- Step 5: Check if there are confirmed bookings without sessions
SELECT 
    'Confirmed bookings missing sessions' as info,
    b.id as booking_id,
    b.student_id,
    p.full_name as student_name,
    b.confirmed_start_at,
    s.id as session_id,
    CASE WHEN s.id IS NULL THEN 'MISSING SESSION!' ELSE 'Has session' END as status
FROM bookings b
LEFT JOIN profiles p ON p.id = b.student_id
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
AND b.confirmed_start_at >= NOW()
AND s.id IS NULL;

-- Done! Check the results above to verify RLS policies and see if any confirmed bookings are missing sessions.
SELECT '✅ All RLS policies recreated successfully!' as final_status;

