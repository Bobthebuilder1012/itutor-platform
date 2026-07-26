-- =====================================================
-- MIGRATION 191: SOFT-DELETE FOR 1:1 RATINGS (admin moderation)
-- =====================================================
-- The 1:1 `ratings` table (mig 001 / 070) had no soft-delete concept — unlike
-- `group_reviews`, which already carries `deleted_at`. Admin review moderation
-- needs a soft-delete + audit trail here too, and the tutor-stat aggregate that
-- feeds profiles.rating_average / rating_count must stop counting removed rows.
--
-- Drift note (could not verify against live DB — Supabase connector was down
-- when this was authored): the existing recompute trigger is described in the
-- handover as `ratings_update_tutor_stats`, writing profiles.rating_average /
-- profiles.rating_count. We REPLACE that function with a deleted_at-aware
-- version and re-create the trigger to also fire on UPDATE (soft-delete is an
-- UPDATE, not a DELETE). If the live function did anything beyond rating_average
-- / rating_count, re-check after applying.
-- =====================================================

BEGIN;

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

CREATE INDEX IF NOT EXISTS idx_ratings_active
  ON public.ratings(tutor_id) WHERE deleted_at IS NULL;

-- Recompute profiles.rating_average / rating_count from NON-deleted rows only.
CREATE OR REPLACE FUNCTION public.ratings_update_tutor_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected uuid := COALESCE(NEW.tutor_id, OLD.tutor_id);
BEGIN
  UPDATE public.profiles p SET
    rating_average = COALESCE(
      (SELECT round(avg(r.stars)::numeric, 2)
         FROM public.ratings r
        WHERE r.tutor_id = affected AND r.deleted_at IS NULL), 0),
    rating_count = COALESCE(
      (SELECT count(*)
         FROM public.ratings r
        WHERE r.tutor_id = affected AND r.deleted_at IS NULL), 0)
  WHERE p.id = affected;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Fire on UPDATE too, so a soft-delete (deleted_at null -> value) recomputes.
DROP TRIGGER IF EXISTS ratings_update_tutor_stats ON public.ratings;
CREATE TRIGGER ratings_update_tutor_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.ratings_update_tutor_stats();

-- Backfill any tutor whose stored average might now differ (no-op if consistent).
UPDATE public.profiles p SET
  rating_average = COALESCE((SELECT round(avg(r.stars)::numeric, 2) FROM public.ratings r WHERE r.tutor_id = p.id AND r.deleted_at IS NULL), 0),
  rating_count   = COALESCE((SELECT count(*) FROM public.ratings r WHERE r.tutor_id = p.id AND r.deleted_at IS NULL), 0)
WHERE p.role = 'tutor';

COMMIT;
