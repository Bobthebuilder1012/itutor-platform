-- =====================================================
-- BOOKING SYSTEM TABLES
-- Implements request/confirm flow with tutor calendars
-- =====================================================

-- 1) TUTOR AVAILABILITY RULES (Recurring teaching hours)
CREATE TABLE IF NOT EXISTS public.tutor_availability_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time time NOT NULL,
    end_time time NOT NULL CHECK (end_time > start_time),
    slot_minutes int NOT NULL DEFAULT 30 CHECK (slot_minutes > 0),
    buffer_minutes int NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutor_avail_rules_tutor ON public.tutor_availability_rules(tutor_id) WHERE is_active = true;

-- 2) TUTOR UNAVAILABILITY BLOCKS (Override availability)
CREATE TABLE IF NOT EXISTS public.tutor_unavailability_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL CHECK (end_at > start_at),
    is_recurring boolean NOT NULL DEFAULT false,
    rrule text, -- Optional for future recurring blocks
    reason_private text, -- Private to tutor, never shown to students
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutor_unavail_tutor_time ON public.tutor_unavailability_blocks(tutor_id, start_at, end_at);

-- 3) SESSION TYPES (Duration/pricing templates)
CREATE TABLE IF NOT EXISTS public.session_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id),
    name text NOT NULL, -- e.g., "Standard Session", "Trial Session"
    duration_minutes int NOT NULL CHECK (duration_minutes > 0),
    price_ttd numeric(10,2) NOT NULL CHECK (price_ttd >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_types_tutor_subject ON public.session_types(tutor_id, subject_id) WHERE is_active = true;

-- 4) BOOKINGS (Main booking table)
CREATE TABLE IF NOT EXISTS public.bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id),
    session_type_id uuid REFERENCES public.session_types(id),
    
    -- Requested time (set by student initially)
    requested_start_at timestamptz NOT NULL,
    requested_end_at timestamptz NOT NULL CHECK (requested_end_at > requested_start_at),
    
    -- Confirmed time (set when tutor confirms)
    confirmed_start_at timestamptz,
    confirmed_end_at timestamptz CHECK (confirmed_end_at IS NULL OR confirmed_end_at > confirmed_start_at),
    
    -- Status tracking
    status text NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')
    ),
    last_action_by text CHECK (last_action_by IN ('student', 'tutor')),
    
    -- Pricing
    price_ttd numeric(10,2) NOT NULL CHECK (price_ttd >= 0),
    
    -- Additional info
    student_notes text,
    tutor_notes text,
    
    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Critical indexes for conflict checking and inbox queries
CREATE INDEX idx_bookings_tutor_confirmed ON public.bookings(tutor_id, confirmed_start_at, confirmed_end_at) 
    WHERE status = 'CONFIRMED';
CREATE INDEX idx_bookings_tutor_requested ON public.bookings(tutor_id, requested_start_at, status);
CREATE INDEX idx_bookings_student ON public.bookings(student_id, created_at DESC);
CREATE INDEX idx_bookings_tutor_inbox ON public.bookings(tutor_id, status, created_at DESC);

-- 5) BOOKING MESSAGES (Chat + time proposals)
CREATE TABLE IF NOT EXISTS public.booking_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id),
    
    message_type text NOT NULL CHECK (message_type IN ('text', 'time_proposal', 'system')),
    body text,
    
    -- For time proposals
    proposed_start_at timestamptz,
    proposed_end_at timestamptz CHECK (
        (proposed_start_at IS NULL AND proposed_end_at IS NULL) OR 
        (proposed_start_at IS NOT NULL AND proposed_end_at IS NOT NULL AND proposed_end_at > proposed_start_at)
    ),
    
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_messages_booking ON public.booking_messages(booking_id, created_at);
CREATE INDEX idx_booking_messages_sender ON public.booking_messages(sender_id);

-- 6) TUTOR RESPONSE METRICS (For displaying avg response time)
CREATE TABLE IF NOT EXISTS public.tutor_response_metrics (
    tutor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    avg_first_response_seconds_30d int,
    total_bookings_30d int DEFAULT 0,
    total_confirmed_30d int DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tutor_avail_rules_updated_at 
    BEFORE UPDATE ON public.tutor_availability_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tutor_unavail_blocks_updated_at 
    BEFORE UPDATE ON public.tutor_unavailability_blocks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_types_updated_at 
    BEFORE UPDATE ON public.session_types 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at 
    BEFORE UPDATE ON public.bookings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify tables
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'tutor_availability_rules', 
    'tutor_unavailability_blocks', 
    'session_types',
    'bookings', 
    'booking_messages',
    'tutor_response_metrics'
)
ORDER BY tablename;





