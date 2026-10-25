-- =====================================================
-- ROLLBACK for 274_identity_providers.sql
-- =====================================================
-- Run by hand. Statuses go back to Stripe's names. Teachers who were being
-- checked by Didit or the manual route lose that information (the provider
-- columns are dropped), and their check reverts to 'pending' on a Stripe-shaped
-- row with no Stripe session: they simply start the check again.

BEGIN;

-- Neutral -> Stripe names.
UPDATE public.tutor_verification_v2
   SET identity_status = 'under_supported_age', identity_error_code = 'under_supported_age'
 WHERE identity_status = 'not_supported' AND identity_error_code = 'minor';

UPDATE public.tutor_verification_v2
   SET identity_status = 'requires_input',
       identity_error_code = COALESCE(identity_provider_code,
         CASE identity_error_code WHEN 'country' THEN 'country_not_supported'
                                  ELSE 'document_type_not_supported' END)
 WHERE identity_status = 'not_supported';

UPDATE public.tutor_verification_v2
   SET identity_status = 'requires_input',
       identity_error_code = COALESCE(identity_provider_code, identity_error_code)
 WHERE identity_status = 'retryable_failure';

-- Sessions that are not Stripe's cannot be represented in the old columns.
UPDATE public.tutor_verification_v2
   SET identity_status = 'pending', identity_error_code = NULL
 WHERE identity_provider IN ('didit', 'veriff') AND identity_status IN ('pending', 'processing');

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_identity_status_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_identity_status_check
  CHECK (identity_status IS NULL OR identity_status IN
    ('pending', 'processing', 'verified', 'requires_input', 'canceled',
     'consent_declined', 'under_supported_age'));

DROP INDEX IF EXISTS public.uq_tutor_verification_v2_provider_session;
ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_identity_provider_check;
ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_identity_country_check;
ALTER TABLE public.tutor_verification_v2
  DROP COLUMN IF EXISTS identity_provider_code,
  DROP COLUMN IF EXISTS identity_country,
  DROP COLUMN IF EXISTS identity_providers_tried,
  DROP COLUMN IF EXISTS identity_session_refs,
  DROP COLUMN IF EXISTS identity_provider_session_ref,
  DROP COLUMN IF EXISTS identity_provider;

ALTER TABLE public.identity_webhook_events DROP COLUMN IF EXISTS provider;

COMMIT;
