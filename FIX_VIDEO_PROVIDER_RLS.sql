-- Fix RLS policies for tutor_video_provider_connections table
-- This allows tutors to view and manage their own video provider connections

-- Enable RLS on the table (if not already enabled)
ALTER TABLE public.tutor_video_provider_connections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Tutors can view their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Tutors can insert their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Tutors can update their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Service role has full access to video connections" ON public.tutor_video_provider_connections;

-- Policy: Tutors can view their own connections
CREATE POLICY "Tutors can view their own video connections"
ON public.tutor_video_provider_connections
FOR SELECT
USING (
  tutor_id = auth.uid()
);

-- Policy: Tutors can insert their own connections
CREATE POLICY "Tutors can insert their own video connections"
ON public.tutor_video_provider_connections
FOR INSERT
WITH CHECK (
  tutor_id = auth.uid()
);

-- Policy: Tutors can update their own connections
CREATE POLICY "Tutors can update their own video connections"
ON public.tutor_video_provider_connections
FOR UPDATE
USING (
  tutor_id = auth.uid()
)
WITH CHECK (
  tutor_id = auth.uid()
);

-- Policy: Service role has full access (for OAuth callbacks)
CREATE POLICY "Service role has full access to video connections"
ON public.tutor_video_provider_connections
FOR ALL
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'tutor_video_provider_connections'
ORDER BY policyname;




