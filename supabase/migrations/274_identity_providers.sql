-- =====================================================
-- 274: PROVIDER-AGNOSTIC IDENTITY VERIFICATION
-- =====================================================
-- WRITTEN, NOT APPLIED. Apply to a local or staging database only.
-- Rollback: supabase/rollbacks/274_identity_providers_rollback.sql
-- Depends on 270-273. ADDITIVE: nothing is dropped and the old Stripe columns
-- (stripe_identity_session_id, identity_session_history) keep working; new code
-- writes the provider columns and, for Stripe, the old ones too.
--
--  1. Provider columns: which provider holds the check, its session reference,
--     every reference ever created (so each can be redacted), the providers
--     already tried (the fallback chain), the document country the teacher chose,
--     and the provider's raw reason code (kept for coverage testing only).
--  2. identity_status becomes the NEUTRAL outcome set:
--        pending, processing, verified, retryable_failure, not_supported,
--        consent_declined, canceled
--     Stripe's old names stay allowed in the CHECK so old rows and a rollback are
--     valid, and existing rows are mapped across below.
--     identity_error_code now holds the NEUTRAL reason (e.g. document_expired,
--     minor), not a provider code.
--  3. identity_webhook_events learns which provider an event came from.
-- =====================================================

BEGIN;

-- ---------------------------------------------------
-- 1. Provider columns
-- ---------------------------------------------------
ALTER TABLE public.tutor_verification_v2
  ADD COLUMN IF NOT EXISTS identity_provider text,
  ADD COLUMN IF NOT EXISTS identity_provider_session_ref text,
  ADD COLUMN IF NOT EXISTS identity_session_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_providers_tried text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS identity_country text,
  ADD COLUMN IF NOT EXISTS identity_provider_code text;

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_identity_provider_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_identity_provider_check
  CHECK (identity_provider IS NULL OR identity_provider IN ('stripe', 'didit', 'veriff'));

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_identity_country_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_identity_country_check
  CHECK (identity_country IS NULL OR identity_country = 'OTHER' OR identity_country ~ '^[A-Z]{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_verification_v2_provider_session
  ON public.tutor_verification_v2 (identity_provider, identity_provider_session_ref)
  WHERE identity_provider_session_ref IS NOT NULL;

-- Backfill: every existing session is a Stripe session.
UPDATE public.tutor_verification_v2
   SET identity_provider = 'stripe',
       identity_provider_session_ref = stripe_identity_session_id,
       identity_providers_tried = ARRAY['stripe'],
       identity_session_refs = COALESCE(
         (SELECT jsonb_agg(jsonb_build_object('provider', 'stripe', 'ref', r))
            FROM unnest(
              CASE WHEN cardinality(identity_session_history) > 0
                   THEN identity_session_history
                   ELSE ARRAY[stripe_identity_session_id] END
            ) AS r),
         '[]'::jsonb)
 WHERE stripe_identity_session_id IS NOT NULL
   AND identity_provider IS NULL;

-- ---------------------------------------------------
-- 2. identity_status: neutral outcomes
-- ---------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tutor_verification_v2'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%identity_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_identity_status_check
  CHECK (identity_status IS NULL OR identity_status IN
    ('pending', 'processing', 'verified', 'retryable_failure', 'not_supported',
     'consent_declined', 'canceled',
     -- legacy Stripe names, kept so old rows and a rollback stay valid
     'requires_input', 'under_supported_age'));

-- Map existing rows. The raw Stripe code is kept in identity_provider_code.
UPDATE public.tutor_verification_v2
   SET identity_provider_code = identity_error_code,
       identity_status = 'not_supported',
       identity_error_code = CASE identity_error_code
         WHEN 'country_not_supported' THEN 'country'
         ELSE 'document_type' END
 WHERE identity_status = 'requires_input'
   AND identity_error_code IN ('country_not_supported', 'document_type_not_supported');

UPDATE public.tutor_verification_v2
   SET identity_provider_code = 'under_supported_age',
       identity_status = 'not_supported',
       identity_error_code = 'minor'
 WHERE identity_status = 'under_supported_age';

UPDATE public.tutor_verification_v2
   SET identity_provider_code = identity_error_code,
       identity_status = 'retryable_failure',
       identity_error_code = CASE identity_error_code
         WHEN 'abandoned' THEN 'abandoned'
         WHEN 'document_expired' THEN 'document_expired'
         WHEN 'document_unverified_other' THEN 'document_invalid'
         WHEN 'selfie_face_mismatch' THEN 'face_mismatch'
         WHEN 'selfie_manipulated' THEN 'selfie_issue'
         WHEN 'selfie_document_missing_photo' THEN 'document_invalid'
         WHEN 'selfie_unverified_other' THEN 'selfie_issue'
         WHEN 'device_not_supported' THEN 'device_unsupported'
         ELSE 'unknown' END
 WHERE identity_status = 'requires_input';

-- ---------------------------------------------------
-- 3. Webhook events: which provider
-- ---------------------------------------------------
ALTER TABLE public.identity_webhook_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe';

COMMIT;
