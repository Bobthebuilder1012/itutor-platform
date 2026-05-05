-- =====================================================
-- EMAIL SEND LOGS TABLE
-- =====================================================
-- Tracks success/failure of onboarding email sends
-- Provides audit trail and debugging information
-- =====================================================

CREATE TABLE public.email_send_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stage integer NOT NULL,
    email_type text NOT NULL,
    status text NOT NULL CHECK (status IN ('success', 'error')),
    error_message text,
    resend_email_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_user_created 
    ON public.email_send_logs(user_id, created_at DESC);

CREATE INDEX idx_email_logs_status 
    ON public.email_send_logs(status, created_at DESC);

-- RLS (service role only)
ALTER TABLE public.email_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" 
    ON public.email_send_logs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.email_send_logs IS 'Audit log for onboarding email sends';
COMMENT ON COLUMN public.email_send_logs.email_type IS 'Format: {user_type}_stage_{stage}';
COMMENT ON COLUMN public.email_send_logs.resend_email_id IS 'Resend API email ID for tracking';
