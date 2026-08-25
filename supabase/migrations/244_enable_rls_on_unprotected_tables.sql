-- 244: Close two public tables that were reachable with the anon key.
--
-- Supabase's default grants give `anon` and `authenticated` full DML on every
-- table in `public`. Row Level Security is the only thing standing between
-- those grants and the data, so a table with RLS off is readable, writable,
-- deletable and TRUNCATE-able by anyone holding the anon key — which ships in
-- the browser bundle.
--
-- Two tables were in that state. Neither is touched by a browser client: the
-- waitlist is only ever read or written through API routes on the service
-- client (which bypasses RLS), and the repair backup is referenced by nothing
-- at all. Enabling RLS with no policies therefore denies anon and
-- authenticated outright while leaving every real code path working.
--
--   group_waitlist_entries
--     Created twice. 094_group_sessions_full_schema.sql creates it AND enables
--     RLS; 160_groups_subscription_foundation.sql re-creates it with
--     CREATE TABLE IF NOT EXISTS and never enables RLS. Any database that got
--     160 without 094 ends up with the table unprotected — which is what
--     happened on staging. Prod does not have the table yet, so this migration
--     also stops it shipping open.
--
--   occurrence_time_repair_backup
--     An ad-hoc rollback snapshot from the 2026-08-07 occurrence-time repair
--     (877 rows on prod). Created outside supabase/migrations entirely, which
--     is why it never picked up the RLS the migration pipeline applies as a
--     matter of course.
--
-- Guarded on to_regclass so this runs cleanly wherever a table is absent.

DO $$
BEGIN
  IF to_regclass('public.group_waitlist_entries') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.group_waitlist_entries ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.occurrence_time_repair_backup') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.occurrence_time_repair_backup ENABLE ROW LEVEL SECURITY';
    -- Nothing reads this and nothing should. Dropping the grants as well means
    -- it stays shut even if a future migration adds a permissive policy.
    EXECUTE 'REVOKE ALL ON public.occurrence_time_repair_backup FROM anon, authenticated';
  END IF;
END $$;
