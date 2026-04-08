-- =====================================================
-- ONBOARDING EMAIL QUEUE TABLE
-- =====================================================
-- Manages automated onboarding email sequences for new users
-- Tracks stage, timing, and activation status
-- =====================================================

CREATE TABLE public.onboarding_email_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type text NOT NULL CHECK (user_type IN ('student', 'tutor', 'parent')),
    stage integer NOT NULL DEFAULT 0 CHECK (stage >= 0 AND stage <= 4),
    next_send_at timestamptz NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    last_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT unique_user_queue UNIQUE (user_id)
);

-- Indexes for performance
CREATE INDEX idx_queue_active_next_send 
    ON public.onboarding_email_queue(is_active, next_send_at) 
    WHERE is_active = true;

CREATE INDEX idx_queue_user_id 
    ON public.onboarding_email_queue(user_id);

-- Updated_at trigger
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.onboarding_email_queue
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (service role only)
ALTER TABLE public.onboarding_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" 
    ON public.onboarding_email_queue 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.onboarding_email_queue IS 'Manages automated onboarding email sequences for new users';
COMMENT ON COLUMN public.onboarding_email_queue.stage IS 'Email stage: 0=welcome, 1=day1, 2=day3, 3=day5, 4=day7';
COMMENT ON COLUMN public.onboarding_email_queue.is_active IS 'False when user activates or sequence completes';
COMMENT ON COLUMN public.onboarding_email_queue.next_send_at IS 'Next scheduled send time';
