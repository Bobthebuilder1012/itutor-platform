-- =====================================================
-- 252: TEACHER VERIFICATION V2
-- =====================================================
-- Behind VERIFICATION_V2_ENABLED. Written, NOT applied. Apply to staging first.
-- Rollback: supabase/rollbacks/252_teacher_verification_v2_rollback.sql
--
-- WHY NEW TABLES AND NOT THE OLD ONES
--   tutor_verification_requests is one row per uploaded FILE with OCR columns
--   (extracted_text, system_recommendation...) and a status machine built around
--   a reviewer reading that file. v2 has no such file for identity (Stripe holds
--   it) and needs one state per TEACHER, so it does not fit.
--   degrees is capped at one row per user and has its own pending/verified
--   lifecycle that already drives a public badge.
--   tutor_verified_subjects is written by an admin AFTER review; v2 credentials
--   are teacher-entered claims awaiting review.
--   Mixing v2 into those would change what the live badge and search read.
--
-- WHAT THIS DOES NOT DO
--   Does not write profiles.tutor_verification_status for any teacher. It only
--   widens the CHECK so the later admin step can write 'REVOKED'.
--   Stores no ID image, ID number, name or DOB from Stripe. Only a session id
--   and a result status.
-- =====================================================

BEGIN;

-- ---------------------------------------------------
-- 1. profiles.tutor_verification_status gains 'REVOKED'
-- ---------------------------------------------------
-- The original CHECK was inline in 024 so its name is whatever Postgres chose.
-- Drop any CHECK on profiles that mentions the column, then add a named one.
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
       ('UNVERIFIED', 'PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED', 'REVOKED')
  );

-- ---------------------------------------------------
-- 2. Per-teacher v2 state
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_verification_v2 (
  tutor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED')),

  consent_at timestamptz,
  consent_version text,

  -- Stripe Identity: the session id and the RESULT only.
  stripe_identity_session_id text,
  identity_status text
    CHECK (identity_status IS NULL OR identity_status IN
      ('pending', 'processing', 'verified', 'requires_input', 'canceled',
       'consent_declined', 'under_supported_age')),
  -- Stripe's last_error.code (an enum such as document_expired). No free text.
  identity_error_code text,
  identity_attempts smallint NOT NULL DEFAULT 0
    CHECK (identity_attempts BETWEEN 0 AND 3),
  identity_verified_at timestamptz,

  submitted_at timestamptz,

  -- Decision fields. Written by the service role only (no teacher policy below).
  decision_reason text,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_verification_v2_stripe_session
  ON public.tutor_verification_v2 (stripe_identity_session_id)
  WHERE stripe_identity_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutor_verification_v2_status
  ON public.tutor_verification_v2 (status);

-- ---------------------------------------------------
-- 3. Credentials (teacher-entered, shown publicly once VERIFIED)
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_credentials_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('CSEC', 'CAPE', 'DEGREE')),

  -- CSEC / CAPE
  subject text CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 100),
  grade text CHECK (grade IS NULL OR char_length(grade) BETWEEN 1 AND 20),
  exam_year smallint CHECK (exam_year IS NULL OR exam_year BETWEEN 1950 AND 2100),

  -- DEGREE
  school text CHECK (school IS NULL OR char_length(school) BETWEEN 1 AND 150),
  degree text CHECK (degree IS NULL OR char_length(degree) BETWEEN 1 AND 150),
  field text CHECK (field IS NULL OR char_length(field) BETWEEN 1 AND 150),
  graduation_year smallint CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2100),

  -- Proof: a link and/or a file in the tutor-credential-proofs bucket.
  proof_url text CHECK (proof_url IS NULL OR
    (char_length(proof_url) <= 500 AND proof_url ~* '^https?://')),
  proof_path text,
  proof_filename text CHECK (proof_filename IS NULL OR char_length(proof_filename) <= 100),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A file may only live under its owner's folder.
  CONSTRAINT tutor_credentials_v2_proof_path_owner
    CHECK (proof_path IS NULL OR proof_path LIKE tutor_id::text || '/%'),

  CONSTRAINT tutor_credentials_v2_shape CHECK (
    (kind IN ('CSEC', 'CAPE')
      AND subject IS NOT NULL AND grade IS NOT NULL AND exam_year IS NOT NULL
      AND (proof_url IS NOT NULL OR proof_path IS NOT NULL))
    OR
    (kind = 'DEGREE'
      AND school IS NOT NULL AND degree IS NOT NULL AND graduation_year IS NOT NULL
      AND proof_path IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tutor_credentials_v2_tutor
  ON public.tutor_credentials_v2 (tutor_id);

-- ---------------------------------------------------
-- 4. Extras (optional, at most 3 per teacher)
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_extras_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 280),
  link_url text CHECK (link_url IS NULL OR
    (char_length(link_url) <= 500 AND link_url ~* '^https?://')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_extras_v2_tutor
  ON public.tutor_extras_v2 (tutor_id);

-- ---------------------------------------------------
-- 5. Triggers: updated_at, immutable owner, row limits
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_v2_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_v2_lock_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id THEN
    RAISE EXCEPTION 'tutor_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- The 3-extras cap. An advisory lock per tutor serialises concurrent inserts so
-- two requests cannot both see 2 rows and both insert. SECURITY DEFINER so the
-- count sees every row of that tutor regardless of the caller's RLS.
CREATE OR REPLACE FUNCTION public.tutor_extras_v2_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tutor_extras_v2:' || NEW.tutor_id::text, 0));
  IF (SELECT count(*) FROM public.tutor_extras_v2 WHERE tutor_id = NEW.tutor_id) >= 3 THEN
    RAISE EXCEPTION 'extras_limit_reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_credentials_v2_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tutor_credentials_v2:' || NEW.tutor_id::text, 0));
  IF (SELECT count(*) FROM public.tutor_credentials_v2 WHERE tutor_id = NEW.tutor_id) >= 20 THEN
    RAISE EXCEPTION 'credentials_limit_reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_verification_v2_touch ON public.tutor_verification_v2;
CREATE TRIGGER trg_tutor_verification_v2_touch
  BEFORE UPDATE ON public.tutor_verification_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_v2_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_touch ON public.tutor_credentials_v2;
CREATE TRIGGER trg_tutor_credentials_v2_touch
  BEFORE UPDATE ON public.tutor_credentials_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_v2_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tutor_extras_v2_touch ON public.tutor_extras_v2;
CREATE TRIGGER trg_tutor_extras_v2_touch
  BEFORE UPDATE ON public.tutor_extras_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_v2_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_lock_owner ON public.tutor_credentials_v2;
CREATE TRIGGER trg_tutor_credentials_v2_lock_owner
  BEFORE UPDATE ON public.tutor_credentials_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_v2_lock_owner();

DROP TRIGGER IF EXISTS trg_tutor_extras_v2_lock_owner ON public.tutor_extras_v2;
CREATE TRIGGER trg_tutor_extras_v2_lock_owner
  BEFORE UPDATE ON public.tutor_extras_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_v2_lock_owner();

DROP TRIGGER IF EXISTS trg_tutor_extras_v2_limit ON public.tutor_extras_v2;
CREATE TRIGGER trg_tutor_extras_v2_limit
  BEFORE INSERT ON public.tutor_extras_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_extras_v2_enforce_limit();

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_limit ON public.tutor_credentials_v2;
CREATE TRIGGER trg_tutor_credentials_v2_limit
  BEFORE INSERT ON public.tutor_credentials_v2
  FOR EACH ROW EXECUTE FUNCTION public.tutor_credentials_v2_enforce_limit();

-- ---------------------------------------------------
-- 6. RLS helpers (SECURITY DEFINER: avoids recursion through profiles RLS)
-- ---------------------------------------------------
-- Teachers may change their credentials and extras only while the submission is
-- still theirs to edit: in progress, or rejected and being fixed.
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

CREATE OR REPLACE FUNCTION public.tutor_v2_is_verified(p_tutor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tutor_verification_v2 v
    WHERE v.tutor_id = p_tutor AND v.status = 'VERIFIED'
  );
$$;

CREATE OR REPLACE FUNCTION public.tutor_v2_viewer_is_student_or_parent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('student', 'parent')
  );
$$;

-- ---------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------
ALTER TABLE public.tutor_verification_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_credentials_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_extras_v2 ENABLE ROW LEVEL SECURITY;

-- tutor_verification_v2: teachers may READ their own row and nothing else.
-- There is deliberately no INSERT/UPDATE/DELETE policy for them, so status,
-- consent, Stripe fields and decision fields are writable by the service role
-- only (the API routes and the Stripe webhook). service_role bypasses RLS.
DROP POLICY IF EXISTS "v2 tutor reads own verification" ON public.tutor_verification_v2;
CREATE POLICY "v2 tutor reads own verification"
  ON public.tutor_verification_v2 FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "v2 admins read all verification" ON public.tutor_verification_v2;
CREATE POLICY "v2 admins read all verification"
  ON public.tutor_verification_v2 FOR SELECT TO authenticated
  USING (public.is_admin_or_reviewer(auth.uid()));

-- tutor_credentials_v2
DROP POLICY IF EXISTS "v2 tutor reads own credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 tutor reads own credentials"
  ON public.tutor_credentials_v2 FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "v2 tutor inserts own credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 tutor inserts own credentials"
  ON public.tutor_credentials_v2 FOR INSERT TO authenticated
  WITH CHECK (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 tutor updates own credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 tutor updates own credentials"
  ON public.tutor_credentials_v2 FOR UPDATE TO authenticated
  USING (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id))
  WITH CHECK (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 tutor deletes own credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 tutor deletes own credentials"
  ON public.tutor_credentials_v2 FOR DELETE TO authenticated
  USING (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 admins read all credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 admins read all credentials"
  ON public.tutor_credentials_v2 FOR SELECT TO authenticated
  USING (public.is_admin_or_reviewer(auth.uid()));

-- Students and parents see credentials of VERIFIED teachers only.
DROP POLICY IF EXISTS "v2 students parents read verified credentials" ON public.tutor_credentials_v2;
CREATE POLICY "v2 students parents read verified credentials"
  ON public.tutor_credentials_v2 FOR SELECT TO authenticated
  USING (
    public.tutor_v2_viewer_is_student_or_parent()
    AND public.tutor_v2_is_verified(tutor_id)
  );

-- tutor_extras_v2
DROP POLICY IF EXISTS "v2 tutor reads own extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 tutor reads own extras"
  ON public.tutor_extras_v2 FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "v2 tutor inserts own extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 tutor inserts own extras"
  ON public.tutor_extras_v2 FOR INSERT TO authenticated
  WITH CHECK (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 tutor updates own extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 tutor updates own extras"
  ON public.tutor_extras_v2 FOR UPDATE TO authenticated
  USING (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id))
  WITH CHECK (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 tutor deletes own extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 tutor deletes own extras"
  ON public.tutor_extras_v2 FOR DELETE TO authenticated
  USING (tutor_id = auth.uid() AND public.tutor_v2_is_editable(tutor_id));

DROP POLICY IF EXISTS "v2 admins read all extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 admins read all extras"
  ON public.tutor_extras_v2 FOR SELECT TO authenticated
  USING (public.is_admin_or_reviewer(auth.uid()));

DROP POLICY IF EXISTS "v2 students parents read verified extras" ON public.tutor_extras_v2;
CREATE POLICY "v2 students parents read verified extras"
  ON public.tutor_extras_v2 FOR SELECT TO authenticated
  USING (
    public.tutor_v2_viewer_is_student_or_parent()
    AND public.tutor_v2_is_verified(tutor_id)
  );

-- ---------------------------------------------------
-- 8. Private storage bucket for proof files
-- ---------------------------------------------------
-- Defined here so it is not dashboard-only (verification_uploads is).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tutor-credential-proofs',
  'tutor-credential-proofs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

-- No client INSERT policy on purpose: files are uploaded through a signed upload
-- URL the server mints, so path, type and size are decided server-side.
DROP POLICY IF EXISTS "v2 proofs owner reads" ON storage.objects;
CREATE POLICY "v2 proofs owner reads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tutor-credential-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "v2 proofs owner deletes while editable" ON storage.objects;
CREATE POLICY "v2 proofs owner deletes while editable"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tutor-credential-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.tutor_v2_is_editable(auth.uid())
  );

-- Reviewers read proofs. Students and parents never read the FILES, only the
-- credential fields (and a proof link if the teacher gave one).
DROP POLICY IF EXISTS "v2 proofs admins read" ON storage.objects;
CREATE POLICY "v2 proofs admins read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tutor-credential-proofs'
    AND public.is_admin_or_reviewer(auth.uid())
  );

DROP POLICY IF EXISTS "v2 proofs admins delete" ON storage.objects;
CREATE POLICY "v2 proofs admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tutor-credential-proofs'
    AND public.is_admin_or_reviewer(auth.uid())
  );

COMMIT;
