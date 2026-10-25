-- =====================================================
-- 273: VERIFICATION V2 REDACTION AND FILE DELETION
-- =====================================================
-- WRITTEN, NOT APPLIED. Rollback: supabase/rollbacks/273_verification_v2_redaction_deletion_rollback.sql
-- Depends on 270-272.
--
--  1. identity_redacted_at: when the Stripe Identity sessions were redacted, so a
--     retry sweep can find the ones that still hold ID data.
--     identity_session_history: EVERY session id a teacher started. A failed
--     attempt still leaves the uploaded ID at Stripe, and only the latest id was
--     stored, so earlier attempts could not be redacted. Session ids are
--     references, not secrets.
--  2. files_deleted_at: when this teacher's verification files were deleted.
--  3. tutor_credentials_v2.proof_deleted_at: a credential keeps its claim (what
--     was reviewed) after its proof file is deleted. The shape CHECK is relaxed
--     for exactly that case.
--  4. A trigger so a TEACHER cannot set proof_deleted_at, which would otherwise
--     let them skip the proof requirement entirely.
-- =====================================================

BEGIN;

ALTER TABLE public.tutor_verification_v2
  ADD COLUMN IF NOT EXISTS identity_redacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_session_history text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS files_deleted_at timestamptz;

-- Rows that already have a current session: seed the history with it.
UPDATE public.tutor_verification_v2
   SET identity_session_history = ARRAY[stripe_identity_session_id]
 WHERE stripe_identity_session_id IS NOT NULL
   AND cardinality(identity_session_history) = 0;

ALTER TABLE public.tutor_credentials_v2
  ADD COLUMN IF NOT EXISTS proof_deleted_at timestamptz;

ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_shape;
ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_shape CHECK (
    (kind IN ('CSEC', 'CAPE')
      AND subject IS NOT NULL AND grade IS NOT NULL AND exam_year IS NOT NULL
      AND (proof_url IS NOT NULL OR proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
    OR
    (kind = 'DEGREE'
      AND school IS NOT NULL AND degree IS NOT NULL AND graduation_year IS NOT NULL
      AND (proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
  );

CREATE OR REPLACE FUNCTION public.tutor_credentials_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.proof_deleted_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.proof_deleted_at IS DISTINCT FROM OLD.proof_deleted_at) THEN
    RAISE EXCEPTION 'proof_deleted_at is set by the server only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_guard ON public.tutor_credentials_v2;
CREATE TRIGGER trg_tutor_credentials_v2_guard
  BEFORE INSERT OR UPDATE ON public.tutor_credentials_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_credentials_v2_guard();

COMMIT;
