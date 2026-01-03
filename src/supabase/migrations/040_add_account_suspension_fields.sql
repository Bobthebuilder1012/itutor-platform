-- =====================================================
-- Add Account Suspension Fields to Profiles
-- =====================================================
-- Adds fields to track account suspension status

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS suspension_reason text,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS suspension_lifted_at timestamptz,
ADD COLUMN IF NOT EXISTS suspension_lifted_by uuid REFERENCES public.profiles(id);

-- Create index for querying suspended accounts
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended) WHERE is_suspended = true;

-- Create index for suspension history queries
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_at ON public.profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Account suspension fields added to profiles table';
END $$;






