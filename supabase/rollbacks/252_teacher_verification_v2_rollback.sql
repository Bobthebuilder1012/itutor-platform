-- =====================================================
-- ROLLBACK for 252_teacher_verification_v2.sql
-- =====================================================
-- Kept out of supabase/migrations/ so nothing that applies "every file in order"
-- can run it by accident. Run by hand, on staging first.
--
-- DESTROYS all v2 verification state, credentials and extras. Take a copy first
-- if any teacher has used the flow.
--
-- BEFORE RUNNING: empty the 'tutor-credential-proofs' bucket (Storage API or
-- dashboard). Part B below refuses to delete a non-empty bucket, on purpose, so
-- no teacher file is dropped silently.

-- ---------- Part A: database objects ----------
BEGIN;

-- Storage policies
DROP POLICY IF EXISTS "v2 proofs owner reads" ON storage.objects;
DROP POLICY IF EXISTS "v2 proofs owner deletes while editable" ON storage.objects;
DROP POLICY IF EXISTS "v2 proofs admins read" ON storage.objects;
DROP POLICY IF EXISTS "v2 proofs admins delete" ON storage.objects;

-- Tables (policies and triggers go with them)
DROP TABLE IF EXISTS public.tutor_extras_v2;
DROP TABLE IF EXISTS public.tutor_credentials_v2;
DROP TABLE IF EXISTS public.tutor_verification_v2;

-- Functions
DROP FUNCTION IF EXISTS public.tutor_extras_v2_enforce_limit();
DROP FUNCTION IF EXISTS public.tutor_credentials_v2_enforce_limit();
DROP FUNCTION IF EXISTS public.tutor_v2_is_editable(uuid);
DROP FUNCTION IF EXISTS public.tutor_v2_is_verified(uuid);
DROP FUNCTION IF EXISTS public.tutor_v2_viewer_is_student_or_parent();
DROP FUNCTION IF EXISTS public.tutor_v2_lock_owner();
DROP FUNCTION IF EXISTS public.tutor_v2_touch_updated_at();

-- profiles CHECK back to the five original values. Anything already 'REVOKED'
-- becomes 'REJECTED', which is what the existing revoke route writes today.
UPDATE public.profiles
   SET tutor_verification_status = 'REJECTED'
 WHERE tutor_verification_status = 'REVOKED';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tutor_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutor_verification_status_check
  CHECK (
    tutor_verification_status IN
      ('UNVERIFIED', 'PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED')
  );

COMMIT;

-- ---------- Part B: the bucket (separate so a non-empty bucket cannot undo Part A) ----------
-- Errors if the bucket still holds files. Empty it first, then run this alone.
DELETE FROM storage.buckets WHERE id = 'tutor-credential-proofs';
