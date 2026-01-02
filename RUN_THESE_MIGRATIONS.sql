-- =====================================================
-- COMPLETE MIGRATION FOR ADMIN ACCOUNT MANAGEMENT
-- =====================================================
-- Run this in your Supabase SQL editor
-- This combines migrations 040 and 041

BEGIN;

-- =====================================================
-- PART 1: ADD SUSPENSION FIELDS TO PROFILES
-- =====================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS suspension_lifted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_lifted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_by ON public.profiles(suspended_by);

COMMENT ON COLUMN public.profiles.is_suspended IS 'Whether the account is currently suspended';
COMMENT ON COLUMN public.profiles.suspension_reason IS 'Reason for account suspension';
COMMENT ON COLUMN public.profiles.suspended_at IS 'Timestamp when the account was suspended';
COMMENT ON COLUMN public.profiles.suspended_by IS 'Admin user ID who suspended the account';
COMMENT ON COLUMN public.profiles.suspension_lifted_at IS 'Timestamp when suspension was lifted';
COMMENT ON COLUMN public.profiles.suspension_lifted_by IS 'Admin user ID who lifted the suspension';

-- =====================================================
-- PART 2: FIX RLS POLICIES FOR ADMINS/REVIEWERS
-- =====================================================
-- Note: We use the existing is_admin_or_reviewer(uuid) function that was created in migration 034

-- Drop old policies that use is_admin()
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Drop new policies in case they already exist
DROP POLICY IF EXISTS "Admins and reviewers can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and reviewers can update all profiles" ON public.profiles;

-- Create new policies that use the existing is_admin_or_reviewer(uuid) function
CREATE POLICY "Admins and reviewers can read all profiles"
ON public.profiles FOR SELECT
USING (public.is_admin_or_reviewer(auth.uid()));

CREATE POLICY "Admins and reviewers can update all profiles"
ON public.profiles FOR UPDATE
USING (public.is_admin_or_reviewer(auth.uid()));

COMMENT ON FUNCTION public.is_admin_or_reviewer IS 'Returns true if the current user has admin role or is_reviewer flag';

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run these to verify the migration worked:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE '%suspend%';
-- SELECT proname FROM pg_proc WHERE proname = 'is_admin_or_reviewer';

