-- =============================================================================
-- 070: One rating per student per tutor (keep latest)
-- =============================================================================
-- Requirements:
-- - A student should only have ONE rating per tutor (not per session).
-- - If duplicates exist, keep ONLY the latest rating.
-- - Tutor stats (profiles.rating_count / rating_average) must update on insert/update/delete.
--
-- Notes:
-- - We keep `ratings.session_id` as "the most recently rated session" for traceability.
-- - Application uses an upsert to overwrite the existing rating when needed.

BEGIN;

-- 1) Deduplicate existing data: keep latest rating per (student_id, tutor_id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, tutor_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.ratings
)
DELETE FROM public.ratings r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- 2) Change uniqueness: no longer unique per session; unique per (student, tutor)
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS unique_session_rating;
ALTER TABLE public.ratings
  ADD CONSTRAINT unique_student_tutor_rating UNIQUE (student_id, tutor_id);

-- 3) Ensure tutor rating stats stay correct on insert/update/delete
CREATE OR REPLACE FUNCTION public.update_tutor_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_tutor_id uuid;
BEGIN
  v_tutor_id := COALESCE(NEW.tutor_id, OLD.tutor_id);

  IF v_tutor_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      rating_count = (SELECT COUNT(*) FROM public.ratings WHERE tutor_id = v_tutor_id),
      rating_average = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE tutor_id = v_tutor_id)
    WHERE id = v_tutor_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ratings_update_tutor_stats ON public.ratings;
CREATE TRIGGER ratings_update_tutor_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tutor_rating();

-- 4) Keep DB helper RPC consistent with "one rating per tutor"
CREATE OR REPLACE FUNCTION public.pending_student_rating_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  WHERE s.student_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.ratings r
      WHERE r.student_id = auth.uid()
        AND r.tutor_id = s.tutor_id
    )
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

-- 5) Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ratings_tutor_created_at ON public.ratings(tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_student_tutor ON public.ratings(student_id, tutor_id);

COMMIT;

