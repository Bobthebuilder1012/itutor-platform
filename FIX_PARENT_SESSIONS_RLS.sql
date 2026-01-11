-- Ensure parents can view their children's sessions

-- Check existing policies
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'sessions' 
AND schemaname = 'public';

-- Drop existing parent policy if it exists
DROP POLICY IF EXISTS "Parents can view their children's sessions" ON public.sessions;

-- Create policy for parents to view sessions of their children
CREATE POLICY "Parents can view their children's sessions"
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

-- Also ensure parents can update sessions (for rescheduling/cancelling)
DROP POLICY IF EXISTS "Parents can update their children's sessions" ON public.sessions;

CREATE POLICY "Parents can update their children's sessions"
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

-- Verify policies were created
SELECT 
    policyname,
    cmd,
    pg_get_expr(qual, 'sessions'::regclass) as using_expression
FROM pg_policies 
WHERE tablename = 'sessions' 
AND schemaname = 'public'
ORDER BY policyname;

RAISE NOTICE 'Parent session RLS policies updated successfully!';












