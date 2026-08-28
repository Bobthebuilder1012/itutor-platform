-- =====================================================
-- 238_attribution_and_events.sql
-- Find Your iTutor — Phase 0: attribution + product event stream
--
-- Plan reference: Find Your iTutor Build Plan v0.1 §2.1.
-- The plan numbered this migration 217; 217-237 were taken by other
-- workstreams between the plan being written (tree at 216) and this build.
-- Renumbered to 238. See §10 of the plan on the two-migration-directory
-- hazard: supabase/migrations is canonical, src/supabase/migrations is stale.
-- =====================================================

-- 1) Attribution + Finder state on the profile ---------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_touch         jsonb,
  ADD COLUMN IF NOT EXISTS last_touch          jsonb,
  ADD COLUMN IF NOT EXISTS signup_ref          text,
  ADD COLUMN IF NOT EXISTS finder_prompted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS finder_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.first_touch IS
  'Attribution of the visitor''s first recorded touch. Written once, never overwritten.';
COMMENT ON COLUMN public.profiles.last_touch IS
  'Attribution of the most recent touch. Overwritten on every attributed visit.';
COMMENT ON COLUMN public.profiles.finder_prompted_at IS
  'Set when the Finder wizard first renders, NOT on completion — otherwise a user who '
  'abandons mid-wizard is re-forced on next login. Plan §3.5.';
COMMENT ON COLUMN public.profiles.finder_completed_at IS
  'Set on wizard submission. Null while prompted-but-skipped, which is what drives the '
  'persistent dashboard card. Kept separate from finder_prompted_at so that '
  'prompted-but-skipped and never-prompted stay distinguishable. Plan §2.1.';

CREATE INDEX IF NOT EXISTS idx_profiles_signup_ref
  ON public.profiles(signup_ref);

-- Drives the login backfill lookup in plan §3.5: "role is student or parent
-- and finder_prompted_at IS NULL". Partial so it stays small as the base is
-- migrated through the one-shot prompt.
CREATE INDEX IF NOT EXISTS idx_profiles_finder_unprompted
  ON public.profiles(role)
  WHERE finder_prompted_at IS NULL;

-- 2) Product event stream ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id     text,
  event       text        NOT NULL,
  props       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  attribution jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_events IS
  'First-party product event stream. Taxonomy is frozen in plan §2.4 — renaming an '
  'event after data accumulates is expensive. No analytics vendor; see plan §10.';
COMMENT ON COLUMN public.product_events.anon_id IS
  'Retained only for pre-signup landing-page events. With the Finder behind auth a '
  'user_id is present from finder_started onward, so no stitching job is required.';

CREATE INDEX IF NOT EXISTS idx_events_event_time ON public.product_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user       ON public.product_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_anon       ON public.product_events(anon_id);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Service role only. Events are written server-side via /api/events so that
-- the attribution cookie cannot be forged by a client-side insert.
DROP POLICY IF EXISTS "Service role manages product_events" ON public.product_events;
CREATE POLICY "Service role manages product_events"
  ON public.product_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Retention marker ----------------------------------------------------

-- retained_30d is emitted by app/api/cron/backfill-retention. This table keeps
-- the cron idempotent: without it a nightly re-run would emit a duplicate
-- retained_30d event for every already-counted student.
CREATE TABLE IF NOT EXISTS public.retention_marks (
  student_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id    uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  first_paid_at timestamptz NOT NULL,
  retained    boolean     NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, group_id)
);

ALTER TABLE public.retention_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages retention_marks" ON public.retention_marks;
CREATE POLICY "Service role manages retention_marks"
  ON public.retention_marks FOR ALL TO service_role USING (true) WITH CHECK (true);
