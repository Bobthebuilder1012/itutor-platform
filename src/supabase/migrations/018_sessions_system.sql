-- =====================================================
-- SESSIONS SYSTEM - COMPLETE IMPLEMENTATION
-- =====================================================
-- Implements video provider connections, sessions, and charging logic

-- =====================================================
-- 1. TUTOR VIDEO PROVIDER CONNECTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tutor_video_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_status TEXT NOT NULL CHECK (connection_status IN ('connected', 'needs_reauth', 'disconnected')) DEFAULT 'connected',
  provider_account_email TEXT,
  provider_account_name TEXT,
  access_token_encrypted TEXT, -- Store in Supabase vault in production
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick tutor lookups
CREATE INDEX idx_tutor_video_connections_tutor ON public.tutor_video_provider_connections(tutor_id);

-- =====================================================
-- 2. SESSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  meeting_external_id TEXT,
  join_url TEXT,
  -- Use confirmed times from booking (when booking is confirmed, these are set)
  scheduled_start_at TIMESTAMPTZ NOT NULL, -- Will be set from booking.confirmed_start_at
  scheduled_end_at TIMESTAMPTZ NOT NULL,   -- Will be set from booking.confirmed_end_at
  duration_minutes INTEGER NOT NULL,
  no_show_wait_minutes INTEGER NOT NULL,
  min_payable_minutes INTEGER NOT NULL,
  meeting_created_at TIMESTAMPTZ,
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,
  tutor_marked_no_show_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN (
    'SCHEDULED',
    'JOIN_OPEN',
    'COMPLETED_ASSUMED',
    'NO_SHOW_STUDENT',
    'EARLY_END_SHORT',
    'CANCELLED'
  )) DEFAULT 'SCHEDULED',
  charge_scheduled_at TIMESTAMPTZ NOT NULL,
  charged_at TIMESTAMPTZ,
  charge_amount_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  payout_amount_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sessions_tutor_scheduled ON public.sessions(tutor_id, scheduled_start_at);
CREATE INDEX idx_sessions_student_scheduled ON public.sessions(student_id, scheduled_start_at);
CREATE INDEX idx_sessions_status_charge ON public.sessions(status, charge_scheduled_at);
CREATE INDEX idx_sessions_booking ON public.sessions(booking_id);

-- =====================================================
-- 3. SESSION EVENTS (AUDIT LOG)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for session event queries
CREATE INDEX idx_session_events_session ON public.session_events(session_id, received_at DESC);

-- =====================================================
-- 4. TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tutor_video_connections_updated_at
BEFORE UPDATE ON public.tutor_video_provider_connections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.tutor_video_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- tutor_video_provider_connections policies
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

-- Explicitly NO DELETE policy (tutors cannot delete their connection)

-- sessions policies
CREATE POLICY "Tutors can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Students can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- NO UPDATE/INSERT/DELETE policies for clients
-- All session modifications go through secure API routes with service role

-- session_events policies
-- NO client access at all (service role only)

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Calculate session rule values
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

-- Check if join window is open
CREATE OR REPLACE FUNCTION is_join_window_open(scheduled_start TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOW() >= (scheduled_start - INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql STABLE;

SELECT '✅ Sessions system tables, indexes, RLS policies, and helper functions created successfully!' AS status;

