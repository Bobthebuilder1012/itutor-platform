-- Create support_requests table for manual verification and other support needs
CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('manual_email_verification', 'account_issue', 'technical_support', 'other')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_support_requests_email ON public.support_requests(email);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON public.support_requests(status);
CREATE INDEX IF NOT EXISTS idx_support_requests_type ON public.support_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_support_requests_created_at ON public.support_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can create support requests for their own email
CREATE POLICY "Users can create support requests"
ON public.support_requests
FOR INSERT
TO public
WITH CHECK (true); -- Allow anyone to create support requests

-- Policy: Users can view their own support requests
CREATE POLICY "Users can view their own support requests"
ON public.support_requests
FOR SELECT
TO authenticated
USING (email = (SELECT auth.jwt() ->> 'email'));

-- Policy: Admins/reviewers can view and manage all support requests
CREATE POLICY "Admins can view all support requests"
ON public.support_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'reviewer'
  )
);

CREATE POLICY "Admins can update support requests"
ON public.support_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'reviewer'
  )
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_support_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER trigger_update_support_request_timestamp
BEFORE UPDATE ON public.support_requests
FOR EACH ROW
EXECUTE FUNCTION update_support_request_updated_at();

COMMENT ON TABLE public.support_requests IS 'Support requests including manual email verification requests';
COMMENT ON COLUMN public.support_requests.request_type IS 'Type of support request (manual_email_verification, account_issue, technical_support, other)';
COMMENT ON COLUMN public.support_requests.status IS 'Current status of the request (pending, in_progress, resolved, rejected)';
