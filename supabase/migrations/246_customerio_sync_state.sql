-- =====================================================
-- CUSTOMER.IO SYNC STATE
-- =====================================================
-- The profiles table is written from ~32 places (signup, onboarding, settings,
-- admin account edits, verification decisions, suspensions). Hooking a sync
-- call into each one guarantees the next new write site is silently missed, so
-- instead this table records what was last shipped per user and a reconciler
-- (/api/cron/sync-customerio) replays anything the profiles_updated_at trigger
-- has moved forward since. One net catches every writer, present and future.

CREATE TABLE IF NOT EXISTS public.customerio_sync_state (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The profiles.updated_at value that was successfully delivered. The
  -- reconciler compares against this, NOT against synced_at: a failed attempt
  -- must not advance the watermark or the change is lost forever.
  synced_updated_at timestamptz,

  -- Hash of the attribute payload actually sent. Lets the reconciler skip a
  -- profile whose updated_at moved but whose synced fields did not (a column
  -- Customer.io does not care about changed), which keeps us well inside the
  -- Track API rate limit on days when a bulk admin edit touches every row.
  attributes_hash text,

  synced_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CREATE TRIGGER has no IF NOT EXISTS, so drop first — otherwise re-running
-- this migration aborts on the trigger even though the table creation is
-- idempotent. (Same pattern as migration 217.)
DROP TRIGGER IF EXISTS customerio_sync_state_updated_at ON public.customerio_sync_state;
CREATE TRIGGER customerio_sync_state_updated_at
  BEFORE UPDATE ON public.customerio_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- The reconciler's ordering key: oldest-pending first, so a large backlog
-- drains fairly instead of starving the same tail every run.
CREATE INDEX IF NOT EXISTS idx_customerio_sync_state_pending
  ON public.customerio_sync_state (synced_updated_at NULLS FIRST);

-- Repeated failures are the thing an operator needs to find.
CREATE INDEX IF NOT EXISTS idx_customerio_sync_state_failures
  ON public.customerio_sync_state (failure_count DESC)
  WHERE failure_count > 0;

-- No policies: this is operational plumbing with no end-user read path, so
-- RLS-on-with-zero-policies leaves it reachable only by the service role.
-- (Consistent with migration 244, which closed the unprotected-table gap.)
ALTER TABLE public.customerio_sync_state ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PENDING PROFILES
-- =====================================================
-- Returns profiles whose updated_at is ahead of what was last delivered, plus
-- those never synced at all. Done in SQL because PostgREST cannot express
-- "left join where the right side is behind" in one round trip, and doing it
-- client-side would mean paging the whole profiles table every run.
--
-- Deliberately NOT security definer: the service role already bypasses RLS,
-- and a definer function here would be a standing privilege escalation for any
-- caller that reached it.
CREATE OR REPLACE FUNCTION public.customerio_pending_profiles(
  p_limit integer DEFAULT 200,
  p_max_failures integer DEFAULT 5
)
RETURNS TABLE (user_id uuid, profile_updated_at timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id, p.updated_at
  FROM public.profiles p
  LEFT JOIN public.customerio_sync_state s ON s.user_id = p.id
  WHERE
    -- Never delivered, or the profile has moved on since the last delivery.
    (s.user_id IS NULL OR s.synced_updated_at IS NULL OR p.updated_at > s.synced_updated_at)
    -- Park rows that keep failing so one poison profile cannot consume every
    -- run's budget and stall the rest of the queue behind it.
    AND coalesce(s.failure_count, 0) < p_max_failures
  ORDER BY coalesce(s.synced_updated_at, 'epoch'::timestamptz) ASC, p.updated_at ASC
  LIMIT greatest(1, least(p_limit, 1000));
$$;

REVOKE ALL ON FUNCTION public.customerio_pending_profiles(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customerio_pending_profiles(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.customerio_pending_profiles(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.customerio_pending_profiles(integer, integer) TO service_role;

COMMENT ON TABLE public.customerio_sync_state IS
  'Per-user watermark for Customer.io profile delivery. Written only by the sync reconciler.';
