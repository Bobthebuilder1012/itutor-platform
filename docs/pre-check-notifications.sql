-- =====================================================================
-- PRE-CHECK for docs/apply-verification-migrations.sql  (READ ONLY)
-- =====================================================================
-- Run this FIRST in the STAGING SQL Editor. Every statement is a SELECT: it
-- changes nothing. The editor shows only the last result, so run the numbered
-- blocks one at a time (select a block, then Run), or use "Run selected".
-- Read each answer against "WHAT YOU WANT" before applying anything.

-- 1. THE NOTIFICATIONS CONSTRAINT  (the one that matters most)
--    WHAT YOU WANT: one row. definition starts with  CHECK ((type = ANY (ARRAY[
--    and contains 'booking_request'. It may end with NOT VALID. If you get ZERO
--    rows, the constraint is named differently or absent: the migration then
--    skips that step and the app's verification notices will fail until it is
--    fixed. If the shape is not an ARRAY, STOP and do not apply.
SELECT conname,
       convalidated,
       pg_get_constraintdef(oid) AS definition,
       pg_get_constraintdef(oid) ILIKE '%ARRAY[%' AS has_array_shape,
       pg_get_constraintdef(oid) LIKE '%VERIFICATION_APPROVED%' AS already_allows_approved
FROM pg_constraint
WHERE conrelid = 'public.notifications'::regclass
  AND conname = 'notifications_type_check';

-- 2. FUNCTIONS THE MIGRATIONS CALL (from migration 217)
--    WHAT YOU WANT: 2 rows. If either is missing, STOP: 271 would fail.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_privileged_request', 'is_admin_or_reviewer');

-- 3. OLD TABLES AND COLUMNS THE GUARD TRIGGERS ATTACH TO
--    WHAT YOU WANT: 9 rows (every one listed below). A missing notifications.metadata is
--    created by the migration; a missing title or link means a different table: STOP.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('profiles', 'is_reviewer'),
    ('profiles', 'tutor_verified_at'),
    ('profiles', 'tutor_verification_status'),
    ('tutor_verification_requests', 'file_path'),
    ('tutor_verified_subjects', 'is_public'),
    ('notifications', 'type'),
    ('notifications', 'title'),
    ('notifications', 'link'),
    ('notifications', 'metadata')
  )
ORDER BY 1, 2;

-- 4. PROFILE STATUS VALUES THE NEW CHECK WOULD REJECT
--    The migration rewrites profiles_tutor_verification_status_check and Postgres
--    re-checks every row. WHAT YOU WANT: zero rows. A row here means the apply
--    would fail (safely, nothing changes): fix or clear those values first.
SELECT tutor_verification_status, count(*) AS profiles
FROM public.profiles
WHERE tutor_verification_status IS NOT NULL
  AND tutor_verification_status NOT IN
      ('UNVERIFIED', 'PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED')
GROUP BY 1;

-- 5. NOTHING OF THE NEW FEATURE EXISTS YET, AND NO NAME CLASHES
--    WHAT YOU WANT: zero rows. (Our files are numbered 270 to 275, after staging's
--    own 269; this checks the OBJECT names do not clash.) Rows here mean part
--    of this was applied before, or something else owns the name: read before going on.
SELECT 'table' AS kind, table_name AS name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tutor_verification_v2', 'tutor_credentials_v2', 'tutor_extras_v2',
                     'tutor_verification_v2_decisions', 'identity_webhook_events', 'identity_outcomes')
UNION ALL
SELECT 'function', proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (proname LIKE 'tutor\_v2\_%' OR proname LIKE 'tutor\_verification\_v2%'
       OR proname IN ('profiles_guard_verification_columns', 'tutor_verification_requests_guard',
                      'tutor_verified_subjects_guard', 'tutor_credentials_v2_guard',
                      'tutor_extras_v2_enforce_limit', 'tutor_credentials_v2_enforce_limit'))
UNION ALL
SELECT 'bucket', id FROM storage.buckets WHERE id = 'tutor-credential-proofs';

-- 6. EXISTING TRIGGERS ON THE THREE OLD TABLES THE MIGRATION TOUCHES (for information)
--    The new guards sit beside these. WHAT YOU WANT: nothing named trg_*guard*
--    that you do not recognise from migration 217.
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('profiles', 'tutor_verification_requests', 'tutor_verified_subjects')
ORDER BY 1, 2;

-- 7. IS THIS REALLY STAGING?  (read the project ref in the browser address bar
--    and in Settings > General. The ref must NOT be nfkrfciozjxrodkusrhh, which is
--    production.) This query only tells you how big the database is.
SELECT (SELECT count(*) FROM public.profiles) AS profiles,
       (SELECT count(*) FROM public.profiles WHERE role = 'tutor') AS tutors,
       current_database() AS db;
