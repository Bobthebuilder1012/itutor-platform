-- =====================================================
-- CREATE SESSIONS TABLE ONLY (MINIMAL)
-- =====================================================

-- Drop sessions if exists
DROP TABLE IF EXISTS public.sessions CASCADE;

-- Create sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE,
  tutor_id UUID NOT NULL,
  student_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  meeting_external_id TEXT,
  join_url TEXT,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
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

-- Add foreign keys AFTER table is created
ALTER TABLE public.sessions 
  ADD CONSTRAINT fk_sessions_booking 
  FOREIGN KEY (booking_id) 
  REFERENCES public.bookings(id) 
  ON DELETE CASCADE;

ALTER TABLE public.sessions 
  ADD CONSTRAINT fk_sessions_tutor 
  FOREIGN KEY (tutor_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

ALTER TABLE public.sessions 
  ADD CONSTRAINT fk_sessions_student 
  FOREIGN KEY (student_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Create indexes
CREATE INDEX idx_sessions_tutor_scheduled ON public.sessions(tutor_id, scheduled_start_at);
CREATE INDEX idx_sessions_student_scheduled ON public.sessions(student_id, scheduled_start_at);
CREATE INDEX idx_sessions_status_charge ON public.sessions(status, charge_scheduled_at);
CREATE INDEX idx_sessions_booking ON public.sessions(booking_id);

SELECT '✅ Sessions table created successfully!' AS status;












