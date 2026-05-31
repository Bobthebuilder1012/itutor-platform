-- ============================================================
-- MIGRATION 131: FK INDEXES + FUNCTION HARDENING (CORRECTED)
-- iTutor Database
-- ============================================================
-- All additive — indexes, search_path fixes, permission tightening.
-- No drops, no schema changes, no data changes.
--
-- Safe to run as a single execution in the Supabase SQL editor
-- (CREATE INDEX without CONCURRENTLY works inside a transaction).
-- On staging the brief ACCESS EXCLUSIVE lock during index build
-- is acceptable. For prod with large tables, swap CREATE INDEX
-- back to CREATE INDEX CONCURRENTLY and run each B-statement
-- individually outside a transaction.
--
-- ------------------------------------------------------------
-- CORRECTIONS vs the original draft of 131:
--   - Part A2 was a no-op (REVOKE FROM anon doesn't remove the
--     default PUBLIC grant). Replaced with REVOKE FROM PUBLIC +
--     explicit GRANT TO authenticated.
--   - Part B dropped 7 broken statements that targeted tables/
--     columns that don't exist on this schema:
--        bookings.parent_id           (no such column)
--        notifications.related_session_id  (no such column)
--        parent_booking_approvals.*   (no such table)
--        availability_rules           (real name: tutor_availability_rules)
--        session_rsvps.user_id        (real column: student_id)
--        lesson_offers.subject_id     (column existence ambiguous —
--                                       two competing 016_ migrations)
--        lesson_offers.tutor_id       (same)
--     These are listed in the "DEFERRED" block at the bottom with
--     verification SQL to run before re-attempting them.
--   - Removed 7 redundant index statements that would have created
--     a 2nd index on a column already covered by an existing index
--     under a different name.
-- ============================================================


-- ============================================================
-- PART A: FUNCTION HARDENING (transactional)
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- A1: Fix search_path on all public functions
-- ----------------------------------------------------------
-- The Supabase security advisor flagged ~80 functions without
-- SET search_path. This bulk-fixes every function in public
-- that doesn't already have a search_path setting.
--
-- Skips functions owned by extensions (pg_trgm, pgcrypto, etc.)
-- because those are managed by the extension and shouldn't be
-- altered by us.

DO $$
DECLARE
  func RECORD;
  func_sig text;
BEGIN
  FOR func IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT (
        COALESCE(array_to_string(p.proconfig, ','), '')
          LIKE '%search_path%'
      )
      -- Skip extension-owned functions (pg_trgm, pgcrypto, etc.)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    func_sig := format('%I.%I(%s)',
      func.schema_name, func.func_name, func.args);
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = public, pg_temp',
        func_sig
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %: %', func_sig, SQLERRM;
    END;
  END LOOP;
END $$;

-- ----------------------------------------------------------
-- A2: Lock function execution to authenticated role
-- ----------------------------------------------------------
-- Postgres GRANTs functions to PUBLIC by default, which means
-- anon can call them. The Supabase advisor flags this.
--
-- Correct fix: REVOKE FROM PUBLIC + GRANT TO authenticated.
-- The allowlist below stays callable from PUBLIC (i.e. by anon).
--
-- Allowlist rationale:
--   - handle_new_user: auth trigger, runs on signup
--   - is_admin: used inside RLS policies; the policy evaluator
--                runs as the user calling the query, so anon
--                still needs EXECUTE for policies to evaluate
--
-- Extension-owned functions (pg_trgm, pgcrypto, etc.) are
-- skipped entirely. They include 31 trigram operator functions
-- (similarity, word_similarity, gtrgm_*, gin_trgm_*) which the
-- GIN trigram index on institutions.name depends on. Anon users
-- hit that index during signup (school autocomplete in
-- /signup, /onboarding/tutor, EditProfileModal), so revoking
-- PUBLIC on them would break signup.

DO $$
DECLARE
  func RECORD;
  -- Functions that MUST remain callable by anon (PUBLIC):
  allowlist text[] := ARRAY[
    'handle_new_user',
    'is_admin'
  ];
BEGIN
  FOR func IN
    SELECT
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname != ALL(allowlist)
      -- Skip extension-owned functions (pg_trgm, pgcrypto, etc.)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        func.func_name, func.args
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        func.func_name, func.args
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %(%): %', func.func_name, func.args, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;


-- ============================================================
-- PART B: MISSING FK INDEXES (verified safe)
-- ============================================================
-- CONCURRENTLY was dropped because the Supabase SQL editor
-- wraps multi-statement scripts in an implicit transaction,
-- and CREATE INDEX CONCURRENTLY can't run inside a transaction.
-- These tables are small enough on staging that the brief
-- ACCESS EXCLUSIVE lock during a regular CREATE INDEX is
-- acceptable. IF NOT EXISTS keeps the migration idempotent.
--
-- For PRODUCTION on a large table you'd want CONCURRENTLY back,
-- in which case run each statement individually via psql or
-- separate SQL-editor executions.
-- ============================================================

-- ----- bookings -----
CREATE INDEX IF NOT EXISTS idx_bookings_subject_id
  ON bookings(subject_id);
CREATE INDEX IF NOT EXISTS idx_bookings_session_type_id
  ON bookings(session_type_id);

-- ----- group_sessions -----
CREATE INDEX IF NOT EXISTS idx_group_sessions_group_id
  ON group_sessions(group_id);

-- ----- group_session_occurrences -----
CREATE INDEX IF NOT EXISTS idx_gso_group_session_id
  ON group_session_occurrences(group_session_id);

-- ----- group_members -----
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON group_members(user_id);

-- ----- notifications -----
CREATE INDEX IF NOT EXISTS idx_notifications_related_booking_id
  ON notifications(related_booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_message_id
  ON notifications(related_message_id);

-- ----- user_subjects -----
CREATE INDEX IF NOT EXISTS idx_user_subjects_subject_id
  ON user_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_user_subjects_user_id
  ON user_subjects(user_id);

-- ----- tutor_subjects -----
CREATE INDEX IF NOT EXISTS idx_tutor_subjects_subject_id
  ON tutor_subjects(subject_id);

-- ----- tutor_availability_rules (actual table name) -----
CREATE INDEX IF NOT EXISTS idx_tutor_avail_rules_tutor_id
  ON tutor_availability_rules(tutor_id);

-- ----- tutor_verified_subjects -----
CREATE INDEX IF NOT EXISTS idx_tutor_verified_subjects_tutor_id
  ON tutor_verified_subjects(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_verified_subjects_subject_id
  ON tutor_verified_subjects(subject_id);

-- ----- session_rsvps (uses student_id, not user_id) -----
-- NOTE: idx_session_rsvps_occurrence already exists from mig 106 —
-- skipping to avoid duplicate indexes on the same column.
CREATE INDEX IF NOT EXISTS idx_session_rsvps_student_id
  ON session_rsvps(student_id);


-- ============================================================
-- DEFERRED — needs DB verification before applying
-- ============================================================
-- The following indexes were in the original 131 draft but
-- target schema that's either missing or ambiguous. Run the
-- verification queries below; for each one that returns a row,
-- uncomment the matching CREATE INDEX line.

-- VERIFY: does bookings have a parent_id column?
--   SELECT 1 FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='bookings' AND column_name='parent_id';
-- If yes:
-- CREATE INDEX IF NOT EXISTS idx_bookings_parent_id
--   ON bookings(parent_id);

-- VERIFY: does notifications have a related_session_id column?
--   SELECT 1 FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='notifications' AND column_name='related_session_id';
-- If yes:
-- CREATE INDEX IF NOT EXISTS idx_notifications_related_session_id
--   ON notifications(related_session_id);

-- VERIFY: does parent_booking_approvals exist as a table?
--   SELECT 1 FROM pg_tables
--   WHERE schemaname='public' AND tablename='parent_booking_approvals';
-- If yes (and confirm column names):
-- CREATE INDEX IF NOT EXISTS idx_pba_student_id
--   ON parent_booking_approvals(student_id);
-- CREATE INDEX IF NOT EXISTS idx_pba_booking_id
--   ON parent_booking_approvals(booking_id);

-- VERIFY: which 016 migration won the race for lesson_offers?
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='lesson_offers'
--     AND column_name IN ('tutor_id','tutor_user_id','subject_id','subject');
-- If you see tutor_id + subject_id (the FIXED schema):
-- CREATE INDEX IF NOT EXISTS idx_lesson_offers_tutor_id
--   ON lesson_offers(tutor_id);
-- CREATE INDEX IF NOT EXISTS idx_lesson_offers_subject_id
--   ON lesson_offers(subject_id);
-- If you see tutor_user_id + subject (the original schema):
-- CREATE INDEX IF NOT EXISTS idx_lesson_offers_tutor_user_id
--   ON lesson_offers(tutor_user_id);


-- ============================================================
-- PART C: VERIFICATION
-- ============================================================

-- Functions with search_path now set (should be 0 remaining unfixed):
-- SELECT count(*) FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prokind = 'f'
--   AND NOT (COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path%');
-- Expected: 0

-- Functions still callable by anon (should be only the allowlist):
-- SELECT p.proname
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prokind = 'f'
--   AND has_function_privilege('anon', p.oid, 'EXECUTE')
-- ORDER BY 1;
-- Expected: only handle_new_user, is_admin

-- All FK columns currently indexed (find any remaining gaps):
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   CASE WHEN i.indexname IS NOT NULL THEN 'indexed' ELSE 'MISSING' END AS status
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- LEFT JOIN pg_indexes i
--   ON i.tablename = tc.table_name
--   AND i.indexdef LIKE '%(' || kcu.column_name || '%'
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
-- ORDER BY 3 DESC, 1;
-- Expected: 0 rows with status='MISSING'
