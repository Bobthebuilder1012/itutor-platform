-- =====================================================
-- MIGRATION 190: TUTOR MARKETPLACE RANKING
-- =====================================================
-- Adds admin promotion levers to profiles, experience/quality
-- stat views, a completion score + blended ranking score, and a
-- single marketplace ranking view both marketplaces order by.
--
-- Client-confirmed decisions (2026-07):
--   * Promotion is PER TUTOR, applied uniformly to the 1:1 and
--     group marketplaces. No per-class boost.
--   * Credentials reuse the existing `degrees` table (mig 096);
--     "has a degrees row" is the completion signal (verified or not).
--   * admin_boost is a gentle nudge (10% of the score). pin_rank is
--     the explicit "push to position N" override that wins over score.
--
-- Numbered 190 because 189 is already taken (189_admin_audit_log.sql).
--
-- Verified against live schema:
--   * sessions.status has NO 'COMPLETED'; a held session is
--     'COMPLETED_ASSUMED' OR 'EARLY_END_SHORT' (018_sessions_system.sql).
--   * groups has no meaningful 'active' status for discovery; live
--     surfaces gate on archived_at IS NULL, so classes = non-archived.
--   * ratings.stars, one row per (tutor,student) (mig 070).
-- =====================================================

BEGIN;

-- ── 1. Promotion columns on profiles ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_boost smallint NOT NULL DEFAULT 0
    CHECK (admin_boost BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pin_rank integer
    CHECK (pin_rank IS NULL OR pin_rank >= 1),
  ADD COLUMN IF NOT EXISTS admin_boost_note text,
  ADD COLUMN IF NOT EXISTS admin_boost_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_boost_updated_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Partial index so the marketplace "pinned first" ordering is cheap.
CREATE INDEX IF NOT EXISTS idx_profiles_pin_rank
  ON public.profiles(pin_rank) WHERE pin_rank IS NOT NULL;

-- ── 2. Guard: only the service role may change boost/pin ────────────
-- The profiles UPDATE policy (mig 059, "profiles_user_update_own_v2")
-- lets any user update THEIR OWN row across ALL columns. Without this
-- guard a tutor could set their own admin_boost/pin_rank straight from
-- the browser client. Admin writes go through getServiceClient()
-- (service role) and are exempt; migrations run as postgres.
CREATE OR REPLACE FUNCTION public.guard_profile_promotion_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted callers: service role (admin API) and superuser (migrations).
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.admin_boost            IS DISTINCT FROM OLD.admin_boost
     OR NEW.pin_rank            IS DISTINCT FROM OLD.pin_rank
     OR NEW.admin_boost_note    IS DISTINCT FROM OLD.admin_boost_note
     OR NEW.admin_boost_updated_at IS DISTINCT FROM OLD.admin_boost_updated_at
     OR NEW.admin_boost_updated_by IS DISTINCT FROM OLD.admin_boost_updated_by THEN
    RAISE EXCEPTION 'admin_boost / pin_rank are admin-only and cannot be set by this role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_promotion ON public.profiles;
CREATE TRIGGER trg_guard_profile_promotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_promotion_columns();

-- ── 3. Experience / quality stat views ──────────────────────────────
-- "Held a session": both terminal states where the lesson actually
-- happened. Plain 'COMPLETED' does not exist in this schema.
CREATE OR REPLACE VIEW public.tutor_session_stats AS
SELECT p.id AS tutor_id,
       count(s.id) FILTER (
         WHERE s.status IN ('COMPLETED_ASSUMED', 'EARLY_END_SHORT')
       ) AS sessions_held
FROM public.profiles p
LEFT JOIN public.sessions s ON s.tutor_id = p.id
WHERE p.role = 'tutor'
GROUP BY p.id;

-- "Classes created": groups the tutor owns that are not archived
-- (mirrors the archived_at gate the live marketplace uses).
CREATE OR REPLACE VIEW public.tutor_class_stats AS
SELECT p.id AS tutor_id,
       count(g.id) FILTER (WHERE g.archived_at IS NULL) AS classes_created
FROM public.profiles p
LEFT JOIN public.groups g ON g.tutor_id = p.id
WHERE p.role = 'tutor'
GROUP BY p.id;

-- ── 4. Completion score (0–100, six equal signals) ──────────────────
-- Mirrors useTutorCompletion + adds credentials. SECURITY DEFINER so
-- anonymous/student callers get correct counts regardless of RLS on
-- the underlying tutor_* tables.
CREATE OR REPLACE FUNCTION public.tutor_completion_score(p_tutor_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
    ( (CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN p.bio IS NOT NULL AND length(trim(p.bio)) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM tutor_subjects ts
                          WHERE ts.tutor_id = p.id AND coalesce(ts.price_per_hour_ttd, 0) > 0) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM tutor_availability_rules ar
                          WHERE ar.tutor_id = p.id) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM tutor_video_provider_connections vc
                          WHERE vc.tutor_id = p.id) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM degrees d
                          WHERE d.user_id = p.id) THEN 1 ELSE 0 END)
    ) * 100.0 / 6.0
  )::int
  FROM profiles p
  WHERE p.id = p_tutor_id;
$$;

-- ── 5. Ranking score (0–100 weighted blend) ─────────────────────────
--   rating       30%  (avg stars / 5)
--   completion   20%  (completion_score / 100)
--   sessions     25%  log-scaled, saturates ~200 sessions
--   classes      15%  log-scaled, saturates ~20 classes
--   admin_boost  10%  (boost / 100)  ← gentle nudge, never a guarantee
CREATE OR REPLACE FUNCTION public.tutor_ranking_score(p_tutor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round((
      30.0 * coalesce((SELECT avg(r.stars) FROM ratings r WHERE r.tutor_id = p.id), 0) / 5.0
    + 20.0 * tutor_completion_score(p.id) / 100.0
    + 25.0 * least(1.0, ln(1 + coalesce(ss.sessions_held, 0)) / ln(1 + 200))
    + 15.0 * least(1.0, ln(1 + coalesce(cs.classes_created, 0)) / ln(1 + 20))
    + 10.0 * coalesce(p.admin_boost, 0) / 100.0
  )::numeric, 3)
  FROM profiles p
  LEFT JOIN tutor_session_stats ss ON ss.tutor_id = p.id
  LEFT JOIN tutor_class_stats  cs ON cs.tutor_id = p.id
  WHERE p.id = p_tutor_id;
$$;

-- ── 6. Single marketplace ranking view (source of truth) ────────────
-- Pinned tutors first in explicit pin_rank order; everyone else by
-- ranking_score desc. pin_rank ties (shouldn't happen — admin UI
-- re-sequences) fall back to ranking_score so there is never a dead tie.
CREATE OR REPLACE VIEW public.tutor_marketplace_rankings AS
SELECT
  p.id                                   AS tutor_id,
  p.admin_boost,
  p.pin_rank,
  coalesce((SELECT avg(r.stars) FROM ratings r WHERE r.tutor_id = p.id), 0)::numeric(3,2) AS rating_avg,
  (SELECT count(*) FROM ratings r WHERE r.tutor_id = p.id)                                AS rating_count,
  tutor_completion_score(p.id)           AS completion_score,
  coalesce(ss.sessions_held, 0)          AS sessions_held,
  coalesce(cs.classes_created, 0)        AS classes_created,
  tutor_ranking_score(p.id)              AS ranking_score
FROM public.profiles p
LEFT JOIN public.tutor_session_stats ss ON ss.tutor_id = p.id
LEFT JOIN public.tutor_class_stats  cs ON cs.tutor_id = p.id
WHERE p.role = 'tutor'
ORDER BY (p.pin_rank IS NULL) ASC, p.pin_rank ASC, tutor_ranking_score(p.id) DESC;

-- Marketplace surfaces read this as anon/authenticated.
GRANT SELECT ON public.tutor_session_stats       TO anon, authenticated;
GRANT SELECT ON public.tutor_class_stats         TO anon, authenticated;
GRANT SELECT ON public.tutor_marketplace_rankings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_completion_score(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_ranking_score(uuid)    TO anon, authenticated;

COMMIT;
