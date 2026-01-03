-- =====================================================
-- SUPPORT REQUESTS TABLE
-- =====================================================
-- Stores support requests from users

CREATE TABLE IF NOT EXISTS public.support_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_name text NOT NULL,
    user_email text NOT NULL,
    user_role text,
    issue text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own support requests
CREATE POLICY "Users can view own support requests"
    ON public.support_requests
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can create support requests
CREATE POLICY "Users can create support requests"
    ON public.support_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Reviewers/admins can view all support requests
CREATE POLICY "Admins can view all support requests"
    ON public.support_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_reviewer = true
        )
    );

-- Reviewers/admins can update support requests
CREATE POLICY "Admins can update support requests"
    ON public.support_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_reviewer = true
        )
    );

-- Create index for faster lookups
CREATE INDEX idx_support_requests_user_id ON public.support_requests(user_id);
CREATE INDEX idx_support_requests_status ON public.support_requests(status);
CREATE INDEX idx_support_requests_created_at ON public.support_requests(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT ON public.support_requests TO authenticated;
GRANT UPDATE ON public.support_requests TO authenticated;

COMMENT ON TABLE public.support_requests IS 'Stores support requests from users that get sent to support@myitutor.com';






