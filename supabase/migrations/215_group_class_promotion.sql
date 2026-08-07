-- ============================================================
-- MIGRATION 215: PROMOTION & RANKING FOR GROUP CLASSES
-- iTutor Database
-- ============================================================
--
-- Migration 190 built promotion for TUTORS and recorded the decision of the
-- day: "Promotion is PER TUTOR... No per-class boost." The group marketplace
-- therefore ordered classes by whoever taught them, and a tutor with four
-- classes had all four move together — there was no way to push one class and
-- not the rest, and nothing to promote a strong class by a new tutor.
--
-- This adds the same three levers to a class, without replacing the tutor
-- ones:
--
--   admin_boost  0–100, worth 10% of the class score. A nudge, as before.
--   pin_rank     explicit placement, wins over score. This is what the
--                admin marketplace drag-and-drop writes.
--   note         why, for the audit trail.
--
-- HOW THE TWO LAYERS COMPOSE (marketplace order):
--   1. class pin_rank      — an admin placed this class here, by hand
--   2. tutor pin_rank      — mig 190's behaviour, kept: a pinned tutor's
--                            classes still float above unpinned ones
--   3. class ranking_score — the blend below
--   4. newest first
--
-- Keeping (2) matters: dropping it would silently retire every tutor pin an
-- admin has already set on the class marketplace.
--
-- THE SCORE IS A BLEND, NOT A REPLACEMENT. 25% of a class's score is its
-- tutor's ranking score, so tutor quality still carries their classes — that
-- is the "link" between the two systems rather than two rankings that
-- disagree with each other.
--
-- Verified against live schema:
--   * groups has no `active`; discovery gates on archived_at IS NULL (as 190).
--   * group_reviews.rating + deleted_at (mig 191/192).
--   * group_members.status is 'approved'/'active' (matching /api/groups).
--   * groups_update RLS is `tutor_id = auth.uid()` across ALL columns, so a
--     tutor could set their own boost from the browser — hence the guard,
--     same reasoning as mig 190 §2.
-- ============================================================

BEGIN;

-- ── 1. Promotion columns on groups ──────────────────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS admin_boost smallint NOT NULL DEFAULT 0
    CHECK (admin_boost BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pin_rank integer
    CHECK (pin_rank IS NULL OR pin_rank >= 1),
  ADD COLUMN IF NOT EXISTS admin_boost_note text,
  ADD COLUMN IF NOT EXISTS admin_boost_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_boost_updated_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groups_pin_rank
  ON public.groups(pin_rank) WHERE pin_rank IS NOT NULL;

-- ── 2. Guard: only the service role may change boost/pin ────────────
CREATE OR REPLACE FUNCTION public.guard_group_promotion_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.admin_boost               IS DISTINCT FROM OLD.admin_boost
     OR NEW.pin_rank               IS DISTINCT FROM OLD.pin_rank
     OR NEW.admin_boost_note       IS DISTINCT FROM OLD.admin_boost_note
     OR NEW.admin_boost_updated_at IS DISTINCT FROM OLD.admin_boost_updated_at
     OR NEW.admin_boost_updated_by IS DISTINCT FROM OLD.admin_boost_updated_by THEN
    RAISE EXCEPTION 'admin_boost / pin_rank are admin-only and cannot be set by this role';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_group_promotion ON public.groups;
CREATE TRIGGER trg_guard_group_promotion
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_group_promotion_columns();

-- ── 3. Per-class stats ──────────────────────────────────────────────
-- Scalar subqueries rather than joins: joining members AND reviews would
-- multiply the two together and inflate both counts.
CREATE OR REPLACE VIEW public.group_class_stats AS
SELECT
  g.id AS group_id,
  (SELECT count(*) FROM public.group_members m
     WHERE m.group_id = g.id AND m.status IN ('approved', 'active')) AS member_count,
  coalesce(g.max_students, 0) AS max_students,
  coalesce((SELECT avg(r.rating) FROM public.group_reviews r
              WHERE r.group_id = g.id AND r.deleted_at IS NULL), 0)::numeric(3,2) AS rating_avg,
  (SELECT count(*) FROM public.group_reviews r
     WHERE r.group_id = g.id AND r.deleted_at IS NULL) AS rating_count
FROM public.groups g;

-- ── 4. Class completeness (0–100, four equal signals) ───────────────
-- The class-page equivalent of tutor_completion_score: is this listing
-- actually ready to be seen by a stranger?
CREATE OR REPLACE FUNCTION public.group_completion_score(p_group_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT round(
    ( (CASE WHEN coalesce(g.cover_image, g.header_image, '') <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN g.description IS NOT NULL AND length(trim(g.description)) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM group_sessions s WHERE s.group_id = g.id) THEN 1 ELSE 0 END)
    + (CASE WHEN g.pricing_model = 'FREE'
                 OR coalesce(g.price_monthly, 0) > 0
                 OR coalesce(g.price_per_session, 0) > 0
                 OR coalesce(g.price_per_course, 0) > 0
            THEN 1 ELSE 0 END)
    ) * 100.0 / 4.0
  )::int
  FROM groups g
  WHERE g.id = p_group_id;
$fn$;

-- ── 5. Class ranking score (0–100 weighted blend) ───────────────────
--   class rating   25%  (avg of group_reviews / 5)
--   tutor rank     25%  (tutor_ranking_score / 100)   ← the link to mig 190
--   traction       15%  log-scaled members, saturates ~20
--   fill           10%  members / max_students
--   completeness   15%  (group_completion_score / 100)
--   admin_boost    10%  (boost / 100)   ← nudge, never a guarantee
CREATE OR REPLACE FUNCTION public.group_ranking_score(p_group_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT round((
      25.0 * coalesce(st.rating_avg, 0) / 5.0
    + 25.0 * coalesce(tutor_ranking_score(g.tutor_id), 0) / 100.0
    + 15.0 * least(1.0, ln(1 + coalesce(st.member_count, 0)) / ln(1 + 20))
    + 10.0 * least(1.0, coalesce(st.member_count, 0)::numeric
                        / NULLIF(coalesce(st.max_students, 0), 0))
    + 15.0 * group_completion_score(g.id) / 100.0
    + 10.0 * coalesce(g.admin_boost, 0) / 100.0
  )::numeric, 3)
  FROM groups g
  LEFT JOIN group_class_stats st ON st.group_id = g.id
  WHERE g.id = p_group_id;
$fn$;

-- ── 6. Marketplace ranking view (source of truth for class order) ───
CREATE OR REPLACE VIEW public.group_marketplace_rankings AS
SELECT
  g.id                            AS group_id,
  g.tutor_id,
  g.name                          AS group_name,
  g.admin_boost,
  g.pin_rank,
  p.pin_rank                      AS tutor_pin_rank,
  coalesce(p.admin_boost, 0)      AS tutor_admin_boost,
  coalesce(tutor_ranking_score(g.tutor_id), 0) AS tutor_ranking_score,
  st.rating_avg,
  st.rating_count,
  st.member_count,
  st.max_students,
  group_completion_score(g.id)    AS completion_score,
  group_ranking_score(g.id)       AS ranking_score,
  g.created_at
FROM public.groups g
JOIN public.profiles p ON p.id = g.tutor_id
LEFT JOIN public.group_class_stats st ON st.group_id = g.id
WHERE g.archived_at IS NULL
ORDER BY
  (g.pin_rank IS NULL) ASC, g.pin_rank ASC,
  (p.pin_rank IS NULL) ASC, p.pin_rank ASC,
  group_ranking_score(g.id) DESC,
  g.created_at DESC;

-- ── 7. Write the whole pinned sequence in one shot ──────────────────
-- The admin marketplace is reordered by dragging, which is a statement about
-- the WHOLE pinned block, not one row: dropping a class at position 3 moves
-- everything below it down. Doing that as N PATCHes would leave the list
-- half-renumbered if one failed, and would transiently duplicate positions.
--
-- Anything not in p_group_ids is unpinned, so dragging a class out of the
-- pinned block is the same call as dragging one in.
CREATE OR REPLACE FUNCTION public.set_group_pin_order(
  p_group_ids uuid[],
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ids uuid[] := coalesce(p_group_ids, '{}'::uuid[]);
  v_pinned int;
BEGIN
  UPDATE public.groups g SET
    pin_rank = NULL,
    admin_boost_updated_at = now(),
    admin_boost_updated_by = coalesce(p_actor, g.admin_boost_updated_by)
  WHERE g.pin_rank IS NOT NULL
    AND NOT (g.id = ANY (v_ids));

  WITH deduped AS (
    -- First mention wins, so a duplicated id cannot produce two positions.
    SELECT DISTINCT ON (t.id) t.id, t.idx
    FROM unnest(v_ids) WITH ORDINALITY AS t(id, idx)
    ORDER BY t.id, t.idx
  ),
  sequenced AS (
    SELECT id, row_number() OVER (ORDER BY idx) AS rn FROM deduped
  )
  UPDATE public.groups g SET
    pin_rank = s.rn,
    admin_boost_updated_at = now(),
    admin_boost_updated_by = coalesce(p_actor, g.admin_boost_updated_by)
  FROM sequenced s
  WHERE g.id = s.id
    AND g.archived_at IS NULL;

  GET DIAGNOSTICS v_pinned = ROW_COUNT;
  RETURN v_pinned;
END;
$fn$;

-- ── 8. Grants ───────────────────────────────────────────────────────
-- The marketplace reads the view as anon/authenticated; only the admin API
-- (service role) may write the order.
GRANT SELECT ON public.group_class_stats            TO anon, authenticated;
GRANT SELECT ON public.group_marketplace_rankings   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_completion_score(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_ranking_score(uuid)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_pin_order(uuid[], uuid) TO service_role;

COMMIT;
