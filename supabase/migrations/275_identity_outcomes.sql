-- =====================================================
-- 275: IDENTITY OUTCOMES LOG
-- =====================================================
-- WRITTEN, NOT APPLIED. Rollback: supabase/rollbacks/275_identity_outcomes_rollback.sql
-- Depends on 274.
--
-- One row per FINISHED identity attempt (verified, retryable_failure,
-- not_supported, consent_declined, canceled), so the coverage test
-- (docs/IDENTITY_COVERAGE_TEST.md) can be scored from data instead of memory:
-- which provider reads which country's documents, how often, how fast.
--
-- PRIVACY: provider name, document country, document TYPE (a label such as
-- "Passport"), neutral outcome, neutral reason, the provider's raw reason code,
-- attempt number and duration. NO names, ID numbers, dates of birth or images,
-- ever. tutor_id is kept so one teacher's attempts can be read together, and
-- becomes NULL if the account is deleted, so the statistics survive but the link
-- to a person does not.
-- =====================================================

BEGIN;

ALTER TABLE public.tutor_verification_v2
  ADD COLUMN IF NOT EXISTS identity_started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.identity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'didit', 'veriff')),
  session_ref text,
  country text CHECK (country IS NULL OR country = 'OTHER' OR country ~ '^[A-Z]{2}$'),
  document_type text CHECK (document_type IS NULL OR char_length(document_type) <= 60),
  outcome text NOT NULL
    CHECK (outcome IN ('verified', 'retryable_failure', 'not_supported', 'consent_declined', 'canceled')),
  -- The NEUTRAL reason (document_expired, minor, country, ...).
  reason text,
  -- The provider's own code. Kept for coverage testing; never shown to teachers.
  provider_code text CHECK (provider_code IS NULL OR char_length(provider_code) <= 80),
  attempt smallint,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_outcomes_provider_country
  ON public.identity_outcomes (provider, country, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_outcomes_tutor
  ON public.identity_outcomes (tutor_id);

ALTER TABLE public.identity_outcomes ENABLE ROW LEVEL SECURITY;

-- Admins and reviewers may read. Nobody has a write policy: the service role inserts.
DROP POLICY IF EXISTS "identity outcomes admins read" ON public.identity_outcomes;
CREATE POLICY "identity outcomes admins read"
  ON public.identity_outcomes FOR SELECT TO authenticated
  USING (public.is_admin_or_reviewer(auth.uid()));

COMMIT;
