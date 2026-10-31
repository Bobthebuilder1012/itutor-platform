-- =====================================================
-- 271: VERIFICATION SECURITY HARDENING
-- =====================================================
-- WRITTEN, NOT APPLIED. Apply to STAGING first.
-- Rollback: supabase/rollbacks/271_verification_security_hardening_rollback.sql
-- Additive: new table, new triggers, one constraint widened. Nothing dropped.
--
-- DEPENDS ON 270_teacher_verification_v2.sql (the v2 tables) being applied first.
--
-- =====================================================================
-- !! VERIFY THE LIVE CONSTRAINT BEFORE APPLYING (section 5) !!
-- =====================================================================
-- Migrations have drifted from the live database before (see 217). Section 5
-- does not re-type the notifications.type list; it reads the LIVE constraint at
-- apply time and adds only the missing VERIFICATION_* values. But look first.
-- Run this on the target database and read the result:
--
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.notifications'::regclass
--     AND conname  = 'notifications_type_check';
--
-- Expected: CHECK ((type = ANY (ARRAY['booking_request'::text, ... ]))) NOT VALID
-- If it has a different shape (not an ARRAY, no 'type = ANY'), section 5 raises
-- and the whole migration rolls back. Fix that section by hand, do not force it.
--
-- WHAT EACH PART FIXES
--  1. identity_webhook_events: idempotency for the new Stripe Identity webhook,
--     separate from stripe_webhook_events (the payment path is untouched).
--  2. tutor_verification_requests: migration 037 let a tutor update ANY column
--     of their own row (status, reviewer_decision, reviewer_reason, ...).
--  3. tutor_verified_subjects: migration 032 says tutors may only change
--     is_public but its policy has no column limit.
--  4. tutor_verification_v2: teachers have no write policy already; this adds a
--     trigger as a backstop that only the service role may write.
--  5. profiles: is_reviewer and tutor_verified_at were not guarded by 217. Any
--     user can update their own profiles row (034), so a user could have set
--     is_reviewer = true on themselves. Added as a SEPARATE trigger so the 217
--     function, which has drifted before, is not redefined.
--  7. notifications: one verification notice per change. A UNIQUE index on
--     (user_id, metadata->>'dedupe_key') so a repeated provider webhook (or any
--     retry) can never insert the same notice twice. Rows without a dedupe_key are
--     not affected. See lib/verificationV2/notify.ts.
--  6. notifications_type_check: lacked VERIFICATION_APPROVED / _REJECTED /
--     _REVOKED, so the inserts the verification routes make were rejected.
--
-- WHY TRIGGERS: a WITH CHECK sees only NEW, never OLD, so it cannot say "this
-- column may not change". A trigger can, and it survives the next policy rewrite
-- (217 makes the same point). They use is_privileged_request() from 217.
-- =====================================================

BEGIN;

-- ---------------------------------------------------
-- 1. Identity webhook idempotency (service role only: RLS on, no policies)
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  -- The Stripe session id and our result only. No payload is stored.
  session_id text,
  processing_status text NOT NULL
    CHECK (processing_status IN ('processed', 'skipped', 'failed', 'abandoned')),
  attempts integer NOT NULL DEFAULT 1,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.identity_webhook_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------
-- 2. tutor_verification_requests: a tutor may change file_path only
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_verification_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service role / migrations, and reviewers and admins deciding requests.
  IF public.is_privileged_request() OR public.is_admin_or_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'file_path' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'file_path' - 'updated_at') THEN
    RAISE EXCEPTION 'a tutor may only change file_path on a verification request'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_verification_requests_guard ON public.tutor_verification_requests;
CREATE TRIGGER trg_tutor_verification_requests_guard
  BEFORE UPDATE ON public.tutor_verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_verification_requests_guard();

-- ---------------------------------------------------
-- 3. tutor_verified_subjects: a tutor may change is_public only
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_verified_subjects_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() OR public.is_admin_or_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'is_public' - 'visibility_updated_at' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'is_public' - 'visibility_updated_at' - 'updated_at') THEN
    RAISE EXCEPTION 'a tutor may only change is_public on a verified subject'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_verified_subjects_guard ON public.tutor_verified_subjects;
CREATE TRIGGER trg_tutor_verified_subjects_guard
  BEFORE UPDATE ON public.tutor_verified_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_verified_subjects_guard();

-- ---------------------------------------------------
-- 4. tutor_verification_v2: service role only (status, decision, Stripe result)
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_verification_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tutor_verification_v2 is written by the server only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_verification_v2_guard ON public.tutor_verification_v2;
CREATE TRIGGER trg_tutor_verification_v2_guard
  BEFORE INSERT OR UPDATE ON public.tutor_verification_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_verification_v2_guard();

-- ---------------------------------------------------
-- 5a. profiles: is_reviewer and tutor_verified_at are not user-writable
-- ---------------------------------------------------
-- Separate from 217's profiles_guard_privileged_columns on purpose.
CREATE OR REPLACE FUNCTION public.profiles_guard_verification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_reviewer IS DISTINCT FROM OLD.is_reviewer THEN
    RAISE EXCEPTION 'is_reviewer is not user-writable' USING ERRCODE = '42501';
  END IF;
  IF NEW.tutor_verified_at IS DISTINCT FROM OLD.tutor_verified_at THEN
    RAISE EXCEPTION 'tutor_verified_at is not user-writable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_verification_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_verification_columns
  BEFORE UPDATE OF is_reviewer, tutor_verified_at ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_verification_columns();

-- ---------------------------------------------------
-- 6. notifications_type_check: add the VERIFICATION_* types
-- ---------------------------------------------------
-- Reads the LIVE definition and inserts the missing values before the closing
-- bracket of its array, so every other type, and a NOT VALID marker if present,
-- is preserved exactly as it is live. VERIFY FIRST (see the header).
DO $$
DECLARE
  v_name constant text := 'notifications_type_check';
  v_needed text[] := ARRAY[
    'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_REVOKED',
    'VERIFICATION_IN_REVIEW', 'VERIFICATION_REVERIFICATION_REQUIRED', 'VERIFICATION_CHECK_FAILED',
    'VERIFICATION_MORE_INFO'
  ];
  v_missing text[] := ARRAY[]::text[];
  v_def text;
  v_item text;
  v_rev int;
  v_pos int;
  v_add text := '';
  v_new text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.notifications'::regclass AND c.conname = v_name;

  IF v_def IS NULL THEN
    RAISE NOTICE '% does not exist on this database, so nothing to widen', v_name;
    RETURN;
  END IF;

  FOREACH v_item IN ARRAY v_needed LOOP
    IF position(quote_literal(v_item) IN v_def) = 0 THEN
      v_missing := v_missing || v_item;
    END IF;
  END LOOP;

  IF coalesce(array_length(v_missing, 1), 0) = 0 THEN
    RAISE NOTICE '% already allows the VERIFICATION_* types', v_name;
    RETURN;
  END IF;

  v_rev := strpos(reverse(v_def), ']');
  IF v_rev = 0 OR position('ARRAY[' IN v_def) = 0 THEN
    RAISE EXCEPTION
      '% has a shape this migration does not recognise. Definition: %. Widen it by hand.',
      v_name, v_def;
  END IF;
  v_pos := length(v_def) - v_rev + 1;  -- index of the last ']'

  FOREACH v_item IN ARRAY v_missing LOOP
    v_add := v_add || ', ' || quote_literal(v_item) || '::text';
  END LOOP;

  v_new := left(v_def, v_pos - 1) || v_add || substr(v_def, v_pos);

  EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_name);
  EXECUTE format('ALTER TABLE public.notifications ADD CONSTRAINT %I %s', v_name, v_new);

  RAISE NOTICE 'added % to %', v_missing, v_name;
END $$;

-- ---------------------------------------------------
-- 7. One verification notice per change
-- ---------------------------------------------------
-- metadata exists live (migration 123); this only guards a database that lacks it.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_verification_dedupe
  ON public.notifications (user_id, (metadata->>'dedupe_key'))
  WHERE metadata->>'dedupe_key' IS NOT NULL;

COMMIT;
