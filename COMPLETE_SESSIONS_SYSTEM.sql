-- =====================================================
-- COMPLETE SESSIONS SYSTEM INSTALLATION
-- =====================================================
-- Run this after sessions table is created

-- =====================================================
-- STEP 1: Create tutor_video_provider_connections
-- =====================================================
DROP TABLE IF EXISTS public.tutor_video_provider_connections CASCADE;

CREATE TABLE public.tutor_video_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_status TEXT NOT NULL CHECK (connection_status IN ('connected', 'needs_reauth', 'disconnected')) DEFAULT 'connected',
  provider_account_email TEXT,
  provider_account_name TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tutor_video_connections_tutor ON public.tutor_video_provider_connections(tutor_id);

SELECT '✅ Step 1: tutor_video_provider_connections created' AS status;

-- =====================================================
-- STEP 2: Create session_events table
-- =====================================================
DROP TABLE IF EXISTS public.session_events CASCADE;

CREATE TABLE public.session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_events_session ON public.session_events(session_id, received_at DESC);

SELECT '✅ Step 2: session_events table created' AS status;

-- =====================================================
-- STEP 3: Create/Update trigger function
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SELECT '✅ Step 3: trigger function created' AS status;

-- =====================================================
-- STEP 4: Create triggers
-- =====================================================
DROP TRIGGER IF EXISTS set_tutor_video_connections_updated_at ON public.tutor_video_provider_connections;
DROP TRIGGER IF EXISTS set_sessions_updated_at ON public.sessions;

CREATE TRIGGER set_tutor_video_connections_updated_at
BEFORE UPDATE ON public.tutor_video_provider_connections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

SELECT '✅ Step 4: triggers created' AS status;

-- =====================================================
-- STEP 5: Enable RLS
-- =====================================================
ALTER TABLE public.tutor_video_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

SELECT '✅ Step 5: RLS enabled' AS status;

-- =====================================================
-- STEP 6: Drop existing policies (if any)
-- =====================================================
DROP POLICY IF EXISTS "Tutors can view their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Tutors can update their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Tutors can insert their own video connections" ON public.tutor_video_provider_connections;
DROP POLICY IF EXISTS "Tutors can view their sessions" ON public.sessions;
DROP POLICY IF EXISTS "Students can view their sessions" ON public.sessions;

SELECT '✅ Step 6: old policies dropped' AS status;

-- =====================================================
-- STEP 7: Create RLS policies
-- =====================================================
CREATE POLICY "Tutors can view their own video connections"
ON public.tutor_video_provider_connections FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can update their own video connections"
ON public.tutor_video_provider_connections FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert their own video connections"
ON public.tutor_video_provider_connections FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Students can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (student_id = auth.uid());

SELECT '✅ Step 7: RLS policies created' AS status;

-- =====================================================
-- STEP 8: Create helper functions
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_session_rules(duration_min INTEGER)
RETURNS TABLE(
  no_show_wait INTEGER,
  min_payable INTEGER
) AS $$
BEGIN
  RETURN QUERY SELECT
    FLOOR(duration_min * 0.33)::INTEGER AS no_show_wait,
    FLOOR(duration_min * 0.66)::INTEGER AS min_payable;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION is_join_window_open(scheduled_start TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOW() >= (scheduled_start - INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql STABLE;

SELECT '✅ Step 8: helper functions created' AS status;

-- =====================================================
-- FINAL CHECK
-- =====================================================
SELECT 
  '🎉 SESSIONS SYSTEM INSTALLATION COMPLETE!' AS status;

SELECT 
  'sessions' as table_name,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sessions') as exists;

SELECT 
  'session_events' as table_name,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_events') as exists;

SELECT 
  'tutor_video_provider_connections' as table_name,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tutor_video_provider_connections') as exists;












