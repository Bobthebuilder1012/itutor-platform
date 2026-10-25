-- =====================================================
-- ROLLBACK for 273_verification_v2_redaction_deletion.sql
-- =====================================================
-- Run by hand. Credentials whose proof was deleted have no proof_url or
-- proof_path, so they would violate the original shape CHECK. The original CHECK
-- is therefore restored NOT VALID: it applies to new and changed rows only, and
-- existing rows are left as they are. Validate it later only after deciding what
-- to do with those rows.

BEGIN;

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_guard ON public.tutor_credentials_v2;
DROP FUNCTION IF EXISTS public.tutor_credentials_v2_guard();

ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_shape;
ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_shape CHECK (
    (kind IN ('CSEC', 'CAPE')
      AND subject IS NOT NULL AND grade IS NOT NULL AND exam_year IS NOT NULL
      AND (proof_url IS NOT NULL OR proof_path IS NOT NULL))
    OR
    (kind = 'DEGREE'
      AND school IS NOT NULL AND degree IS NOT NULL AND graduation_year IS NOT NULL
      AND proof_path IS NOT NULL)
  ) NOT VALID;

ALTER TABLE public.tutor_credentials_v2 DROP COLUMN IF EXISTS proof_deleted_at;
ALTER TABLE public.tutor_verification_v2
  DROP COLUMN IF EXISTS files_deleted_at,
  DROP COLUMN IF EXISTS identity_session_history,
  DROP COLUMN IF EXISTS identity_redacted_at;

COMMIT;
