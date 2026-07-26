-- =====================================================
-- MIGRATION 192: 3-CATEGORY GROUP RATINGS
-- =====================================================
-- Extends the existing `group_reviews` table (mig 094) with three optional
-- sub-scores (1-5 each). The existing `rating` column stays the OVERALL score;
-- the API sets it to round(avg(patience, explanation, class_material)) at write
-- time, so every downstream consumer (recalculateRating, group marketplace,
-- ranking blend in mig 193) keeps working unchanged. Written reviews (`comment`)
-- remain optional.
--
-- We deliberately do NOT convert `rating` to a generated column: it already
-- exists as a plain column with live data, and legacy single-score reviews
-- (pre-192) must keep their value. New reviews compute it in the API route.
-- =====================================================

BEGIN;

ALTER TABLE public.group_reviews
  ADD COLUMN IF NOT EXISTS patience_rating       smallint CHECK (patience_rating       BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS explanation_rating    smallint CHECK (explanation_rating    BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS class_material_rating smallint CHECK (class_material_rating BETWEEN 1 AND 5);

-- Per-class category averages for the "carded breakdown" display. Only counts
-- active (non-deleted) reviews. category_review_count = reviews that actually
-- carried the 3 sub-scores (legacy single-score reviews are excluded from the
-- category averages but still count toward the overall review_count).
CREATE OR REPLACE VIEW public.group_review_category_averages AS
SELECT
  group_id,
  max(tutor_id)                                                              AS tutor_id,
  round(avg(patience_rating)       FILTER (WHERE patience_rating IS NOT NULL)::numeric, 2)       AS avg_patience,
  round(avg(explanation_rating)    FILTER (WHERE explanation_rating IS NOT NULL)::numeric, 2)    AS avg_explanation,
  round(avg(class_material_rating) FILTER (WHERE class_material_rating IS NOT NULL)::numeric, 2) AS avg_class_material,
  round(avg(rating)::numeric, 2)                                             AS avg_overall,
  count(*) FILTER (WHERE patience_rating IS NOT NULL)                        AS category_review_count,
  count(*)                                                                   AS review_count
FROM public.group_reviews
WHERE deleted_at IS NULL
GROUP BY group_id;

GRANT SELECT ON public.group_review_category_averages TO anon, authenticated;

COMMIT;
