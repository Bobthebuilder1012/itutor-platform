-- =====================================================
-- ROLLBACK for 253_verification_security_hardening.sql
-- =====================================================
-- Run by hand, on staging first. Kept out of supabase/migrations/ so nothing
-- that applies "every file in order" can run it by accident.
--
-- Removes the triggers and the identity_webhook_events table.
--
-- DOES NOT narrow notifications_type_check. Section 6 of 253 only ADDED three
-- values to the live list; taking them out again could reject rows that already
-- use them, and nothing is gained by it. Leaving the wider list is harmless. If
-- you really must remove them, delete or update any notifications whose type is
-- VERIFICATION_APPROVED / VERIFICATION_REJECTED / VERIFICATION_REVOKED first,
-- then rebuild the constraint by hand from its live definition.

BEGIN;

DROP TRIGGER IF EXISTS trg_profiles_guard_verification_columns ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_guard_verification_columns();

DROP TRIGGER IF EXISTS trg_tutor_verification_v2_guard ON public.tutor_verification_v2;
DROP FUNCTION IF EXISTS public.tutor_verification_v2_guard();

DROP TRIGGER IF EXISTS trg_tutor_verified_subjects_guard ON public.tutor_verified_subjects;
DROP FUNCTION IF EXISTS public.tutor_verified_subjects_guard();

DROP TRIGGER IF EXISTS trg_tutor_verification_requests_guard ON public.tutor_verification_requests;
DROP FUNCTION IF EXISTS public.tutor_verification_requests_guard();

-- Loses the record of which identity events were processed. Stripe redelivery of
-- an old event would then be applied again (harmless: a passed check is never
-- downgraded and a replaced session is ignored).
DROP TABLE IF EXISTS public.identity_webhook_events;

COMMIT;
