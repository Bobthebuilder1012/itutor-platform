-- =====================================================
-- ROLLBACK for 257_identity_outcomes.sql
-- =====================================================
-- Run by hand. Deletes the coverage-test data; export it first if you want it.

BEGIN;

DROP TABLE IF EXISTS public.identity_outcomes;
ALTER TABLE public.tutor_verification_v2 DROP COLUMN IF EXISTS identity_started_at;

COMMIT;
