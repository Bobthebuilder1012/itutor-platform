-- =====================================================
-- 254: VERIFICATION V2 REVIEW (admin review, reverification, audit)
-- =====================================================
-- WRITTEN, NOT APPLIED. Apply to a local or staging database only, never
-- production from here. Rollback: supabase/rollbacks/254_verification_v2_review_rollback.sql
-- Depends on 252 and 253.
--
--  1. REVERIFICATION_REQUIRED becomes a status on profiles AND on
--     tutor_verification_v2. It is distinct from REJECTED (a decision on an
--     application) and REVOKED (verified status taken away): an admin asked the
--     teacher to verify again.
--  2. tutor_v2_is_editable() learns that a teacher in REVERIFICATION_REQUIRED
--     may edit their credentials and extras.
--  3. tutor_verification_v2_decisions: an append-only record of every admin or
--     reviewer decision. UPDATE and DELETE are refused for everyone, including
--     the service role. It has no foreign keys on purpose: the record must
--     outlive the teacher's account.
-- =====================================================

BEGIN;

-- ---------------------------------------------------
-- 1a. profiles.tutor_verification_status gains REVERIFICATION_REQUIRED
-- ---------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tutor_verification_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutor_verification_status_check
  CHECK (
    tutor_verification_status IS NULL
    OR tutor_verification_status IN
       ('UNVERIFIED', 'PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED', 'REVOKED',
        'REVERIFICATION_REQUIRED')
  );

-- ---------------------------------------------------
-- 1b. tutor_verification_v2.status gains REVERIFICATION_REQUIRED
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
      AND pg_get_constraintdef(oid) ILIKE '%IN_PROGRESS%'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_status_check
  CHECK (status IN ('IN_PROGRESS', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED',
                    'REVERIFICATION_REQUIRED'));

-- ---------------------------------------------------
-- 2. Editable while in progress, rejected, or asked to reverify
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_v2_is_editable(p_tutor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tutor_verification_v2 v
    WHERE v.tutor_id = p_tutor
      AND v.status IN ('IN_PROGRESS', 'REJECTED', 'REVERIFICATION_REQUIRED')
  );
$$;

-- ---------------------------------------------------
-- 3. Decision audit (append-only)
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_verification_v2_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No foreign keys: the record outlives the account.
  tutor_id uuid NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'reviewer', 'system')),
  action text NOT NULL
    CHECK (action IN ('APPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION')),
  from_status text,
  to_status text,
  -- What the same decision did to profiles.tutor_verification_status.
  profile_from_status text,
  profile_to_status text,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_verification_v2_decisions_tutor
  ON public.tutor_verification_v2_decisions (tutor_id, created_at DESC);

ALTER TABLE public.tutor_verification_v2_decisions ENABLE ROW LEVEL SECURITY;

-- Admins and reviewers may read. Nobody has a write policy: rows are inserted by
-- the service role only.
DROP POLICY IF EXISTS "v2 admins read decisions" ON public.tutor_verification_v2_decisions;
CREATE POLICY "v2 admins read decisions"
  ON public.tutor_verification_v2_decisions FOR SELECT TO authenticated
  USING (public.is_admin_or_reviewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.tutor_verification_v2_decisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'tutor_verification_v2_decisions is append-only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_verification_v2_decisions_append_only
  ON public.tutor_verification_v2_decisions;
CREATE TRIGGER trg_tutor_verification_v2_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.tutor_verification_v2_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_verification_v2_decisions_append_only();

COMMIT;
