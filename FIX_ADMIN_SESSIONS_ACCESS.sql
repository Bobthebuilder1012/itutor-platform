-- Fix Admin Dashboard - Sessions Not Showing
-- This script ensures admins can view all sessions

-- Step 1: Check current policies on sessions table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'sessions'
ORDER BY policyname;

-- Step 2: Verify is_admin() function exists and works
SELECT public.is_admin() as am_i_admin;

-- Step 3: Check if there are any sessions in the database
SELECT COUNT(*) as total_sessions FROM sessions;

-- Step 4: Check session statuses
SELECT status, COUNT(*) as count 
FROM sessions 
GROUP BY status 
ORDER BY count DESC;

-- Step 5: Drop and recreate admin policies if they don't exist or are broken
DO $$ 
BEGIN
  -- Drop existing admin policies
  DROP POLICY IF EXISTS "Admins can read all sessions" ON sessions;
  DROP POLICY IF EXISTS "Admins can create any session" ON sessions;
  DROP POLICY IF EXISTS "Admins can update any session" ON sessions;
  
  RAISE NOTICE 'Dropped existing admin policies (if any)';
END $$;

-- Step 6: Create comprehensive admin access policies
CREATE POLICY "Admins can read all sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can create any session"
ON public.sessions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update any session"
ON public.sessions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete any session"
ON public.sessions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Step 7: Verify policies were created
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'sessions' AND policyname LIKE '%Admins%'
ORDER BY policyname;

-- Step 8: Test query as admin (run this as your admin user)
SELECT 
  id,
  status,
  scheduled_start_at,
  scheduled_end_at,
  duration_minutes,
  charge_amount_ttd
FROM sessions
ORDER BY scheduled_start_at DESC
LIMIT 5;
