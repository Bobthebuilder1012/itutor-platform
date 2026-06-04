-- ============================================================
-- MIGRATION 127: Full Supabase dead-resource cleanup
-- ============================================================
-- Every drop below was verified by:
--   (1) zero ".from('<name>')", ".rpc('<name>')",
--       ".storage.from('<name>')", ".functions.invoke('<name>')"
--       references in the TS/React codebase
--   (2) no SQL function / trigger writes from active paths
--
-- Pre-flight safety guard aborts if any "supposed to be empty"
-- table has rows. Override with:
--   SET "iTutor.allow_nonempty_drop" = 'true';
-- before running.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Safety guard: refuse to drop tables that still have rows
-- ------------------------------------------------------------
DO $$
DECLARE
  v_allow text := current_setting('iTutor.allow_nonempty_drop', true);
  v_table text;
  v_count bigint;
  v_offenders text := '';
BEGIN
  IF v_allow IS DISTINCT FROM 'true' THEN
    FOR v_table IN
      SELECT unnest(ARRAY[
        'dm_requests',
        'tutor_verifications',
        'tutor_verified_subject_grades',
        'session_events',
        'group_messages',
        'group_announcements',
        'community_message_reactions_v2',
        'subject_community_pinned_sessions'
      ])
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = v_table
      ) THEN
        EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
        IF v_count > 0 THEN
          v_offenders := v_offenders || format(' %s(%s)', v_table, v_count);
        END IF;
      END IF;
    END LOOP;

    IF v_offenders <> '' THEN
      RAISE EXCEPTION
        'Refusing to drop non-empty tables:%. Set iTutor.allow_nonempty_drop=true to override.',
        v_offenders;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Code-dead tables flagged in earlier audit
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.dm_requests CASCADE;
DROP TABLE IF EXISTS public.tutor_verifications CASCADE;
DROP TABLE IF EXISTS public.tutor_verified_subject_grades CASCADE;
DROP TABLE IF EXISTS public.session_events CASCADE;

-- ------------------------------------------------------------
-- 2. Group messaging + announcements (UI consumers deleted in this PR)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.group_announcements CASCADE;

-- ------------------------------------------------------------
-- 3. Orphans of the community v2 / subject community surfaces
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.community_message_reactions_v2 CASCADE;
DROP TABLE IF EXISTS public.subject_community_pinned_sessions CASCADE;

-- ------------------------------------------------------------
-- 4. RPC functions orphaned by the table drops above
-- ------------------------------------------------------------
-- These reference dropped tables / columns and will throw at first call.
-- Dropping the table CASCADE removes dependent triggers but NOT the
-- functions themselves, so we drop them explicitly.

-- Depended on dm_requests
DROP FUNCTION IF EXISTS public.can_dm_user(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_connected_users(uuid) CASCADE;

-- ------------------------------------------------------------
-- 5. One-time / never-called RPCs
-- ------------------------------------------------------------
-- One-time migration helper from 049 — has already been run.
DROP FUNCTION IF EXISTS public.migrate_school_to_institution_id() CASCADE;

COMMIT;

-- ============================================================
-- NOT DROPPED — flagged for human sign-off
-- ============================================================
-- These have no code references but may carry historical data or
-- represent a feature you plan to revive. Verify before dropping.
--
-- TABLES (financial history)
--   tutor_earnings, tutor_balances, commission_ledger, payout_requests,
--   tutor_payout_accounts, payout_ledger
--     Run: SELECT count(*) FROM <table>;
--     If 0 and no plans to revive: drop them, then drop the SQL
--     functions below which write to payout_ledger.
--
-- RPC FUNCTIONS (defined, never invoked from code or triggers)
--   public.mark_session_completed_with_payout(uuid)
--   public.release_payout(uuid)
--   public.get_payer_for_student(uuid)
--     These are leftovers of the v1 payout system. Drop only after
--     confirming you've migrated off them. Drop order:
--       1) DROP FUNCTION release_payout(uuid);
--       2) DROP FUNCTION mark_session_completed_with_payout(uuid);
--       3) DROP FUNCTION get_payer_for_student(uuid);
--
-- STORAGE BUCKETS (defined but never referenced from code)
--   verification_docs   -- superseded by 'tutor-verifications'
--     Verify it's empty in the Dashboard, then:
--       DELETE FROM storage.objects WHERE bucket_id = 'verification_docs';
--       DELETE FROM storage.buckets  WHERE id = 'verification_docs';
--
-- ORPHANS THAT BECOME DEAD ONLY IF YOU RUN THE PENDING "MIGRATION 1"
-- (the one that drops communities*, school_communities*, subject_communities,
--  group_sessions*, degrees, etc.). These were flagged unsafe earlier
-- because the corresponding code still uses them. After the code is
-- removed AND those tables are dropped, also drop:
--   public.log_mod_action(...)
--   public.is_community_moderator(uuid, uuid)
--   public.can_post_in_community(uuid, uuid)
--   public.ensure_school_communities(uuid)
--   public.auto_assign_school_communities()
--   public.backfill_school_community_memberships()
--   public.user_institution_id()
--   public.user_is_subject_community_member(uuid)
--   public.subject_community_update_member_count()
--   public.school_community_messages_updated_at()
--   public.increment_answer_count()
--   public.decrement_answer_count()
--   public.update_question_status()
--   TYPE public.community_type, community_audience, member_role,
--        member_status, school_community_member_status,
--        school_community_member_role, v2_community_type,
--        v2_community_member_role, v2_community_member_status,
--        subject_community_message_type, question_status,
--        report_target_type, report_reason, mod_action_type,
--        dm_request_status
-- ============================================================


-- ============================================================
-- HOW THIS WAS DETERMINED — run these queries on your DB to
-- repeat the audit for any future cleanup.
-- ============================================================
--
-- 1) Tables with zero rows AND zero usage since last stats reset
-- ------------------------------------------------------------
-- SELECT
--   c.relname AS table,
--   pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
--   s.n_live_tup AS row_count,
--   s.seq_scan + COALESCE(s.idx_scan, 0) AS total_scans,
--   s.n_tup_ins AS inserts,
--   s.n_tup_upd AS updates,
--   s.last_seq_scan,
--   s.last_idx_scan
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
-- WHERE n.nspname = 'public' AND c.relkind = 'r'
-- ORDER BY total_scans NULLS FIRST, n_live_tup;
--
-- 2) Indexes never used (after at least one week of normal traffic)
-- ------------------------------------------------------------
-- SELECT s.schemaname, s.relname AS table, s.indexrelname AS index,
--        pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
--        s.idx_scan
-- FROM pg_stat_user_indexes s
-- JOIN pg_index i ON i.indexrelid = s.indexrelid
-- WHERE NOT i.indisunique
--   AND NOT i.indisprimary
--   AND s.idx_scan = 0
-- ORDER BY pg_relation_size(s.indexrelid) DESC;
--
-- 3) Functions never invoked
-- ------------------------------------------------------------
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        s.calls
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- LEFT JOIN pg_stat_user_functions s ON s.funcid = p.oid
-- WHERE n.nspname = 'public'
--   AND (s.calls IS NULL OR s.calls = 0)
-- ORDER BY p.proname;
--   (Then cross-reference each against ".rpc('<name>')" greps and
--    SQL trigger definitions, since trigger calls do not always
--    increment pg_stat_user_functions.calls.)
--
-- 4) RLS policies on tables that no longer exist
-- ------------------------------------------------------------
-- SELECT p.schemaname, p.tablename, p.policyname
-- FROM pg_policies p
-- LEFT JOIN pg_class c
--   ON c.relname = p.tablename
--   AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = p.schemaname)
-- WHERE c.oid IS NULL;
--
-- 5) Storage buckets with no recent object writes
-- ------------------------------------------------------------
-- SELECT b.id, b.name, b.public,
--        count(o.id) AS object_count,
--        max(o.updated_at) AS last_write
-- FROM storage.buckets b
-- LEFT JOIN storage.objects o ON o.bucket_id = b.id
-- GROUP BY b.id, b.name, b.public
-- ORDER BY last_write NULLS FIRST;
--
-- 6) Enum types not referenced by any column
-- ------------------------------------------------------------
-- SELECT t.typname
-- FROM pg_type t
-- JOIN pg_namespace n ON n.oid = t.typnamespace
-- WHERE n.nspname = 'public'
--   AND t.typtype = 'e'
--   AND NOT EXISTS (
--     SELECT 1 FROM information_schema.columns c
--     WHERE c.udt_name = t.typname
--   );
-- ============================================================
