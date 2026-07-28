-- =====================================================
-- MIGRATION 193: BLEND GROUP RATINGS INTO THE TUTOR RANKING
-- =====================================================
-- Reconciliation flagged in the handover (chosen option b): tutor_ranking_score()
-- from mig 190 only read the 1:1 `ratings` table, so a tutor who teaches only
-- (well-rated) group classes ranked as if they had no rating at all. This
-- replaces ONLY the rating term with a blended average across BOTH tables —
-- each review row weighted equally — filtered to non-deleted rows. Everything
-- else (completion / sessions / classes / admin_boost weights) is byte-for-byte
-- identical to mig 190.
--
-- profiles.rating_average keeps meaning "1:1 only" for all other callers; the
-- "what counts toward rank" decision now lives solely in this function.
--
-- DEPENDENCY: requires mig 191 (adds ratings.deleted_at) to have been applied
-- first, since the blend filters `ratings.deleted_at IS NULL`.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tutor_ranking_score(p_tutor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round((
      -- rating 30% — blended 1:1 (ratings.stars) + group (group_reviews.rating),
      -- each row weighted equally; 0 when the tutor has no reviews at all.
      30.0 * coalesce(
        ( coalesce((SELECT sum(r.stars)::numeric  FROM ratings r       WHERE r.tutor_id  = p.id AND r.deleted_at  IS NULL), 0)
        + coalesce((SELECT sum(gr.rating)::numeric FROM group_reviews gr WHERE gr.tutor_id = p.id AND gr.deleted_at IS NULL), 0) )
        / NULLIF(
            coalesce((SELECT count(*) FROM ratings r        WHERE r.tutor_id  = p.id AND r.deleted_at  IS NULL), 0)
          + coalesce((SELECT count(*) FROM group_reviews gr WHERE gr.tutor_id = p.id AND gr.deleted_at IS NULL), 0)
        , 0)
      , 0) / 5.0
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

COMMIT;
