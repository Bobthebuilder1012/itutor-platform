-- =====================================================
-- ROLLBACK for 254_verification_v2_review.sql
-- =====================================================
-- Run by hand. DESTROYS the decision audit table (take a copy first if it holds
-- anything you need: the trigger refuses DELETE, but DROP TABLE is allowed).
-- Teachers in REVERIFICATION_REQUIRED are moved back to a status the old
-- constraints accept before the constraints are restored.

BEGIN;

-- profiles: REVERIFICATION_REQUIRED -> REJECTED (needs a fresh submission, like it did)
UPDATE public.profiles
   SET tutor_verification_status = 'REJECTED'
 WHERE tutor_verification_status = 'REVERIFICATION_REQUIRED';

-- v2: REVERIFICATION_REQUIRED -> REJECTED
UPDATE public.tutor_verification_v2
   SET status = 'REJECTED'
 WHERE status = 'REVERIFICATION_REQUIRED';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tutor_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutor_verification_status_check
  CHECK (
    tutor_verification_status IS NULL
    OR tutor_verification_status IN
       ('UNVERIFIED', 'PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED', 'REVOKED')
  );

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_status_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_status_check
  CHECK (status IN ('IN_PROGRESS', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED'));

-- editable helper back to 252's definition
CREATE OR REPLACE FUNCTION public.tutor_v2_is_editable(p_tutor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tutor_verification_v2 v
    WHERE v.tutor_id = p_tutor AND v.status IN ('IN_PROGRESS', 'REJECTED')
  );
$$;

DROP TRIGGER IF EXISTS trg_tutor_verification_v2_decisions_append_only
  ON public.tutor_verification_v2_decisions;
DROP FUNCTION IF EXISTS public.tutor_verification_v2_decisions_append_only();
DROP TABLE IF EXISTS public.tutor_verification_v2_decisions;

COMMIT;
