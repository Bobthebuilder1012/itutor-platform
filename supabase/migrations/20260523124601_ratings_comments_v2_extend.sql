-- =====================================================
-- RATINGS & COMMENTS V2 — PHASE 2: EXTEND EXISTING TABLES
-- =====================================================

-- 2a. Add tutor format preference to profiles
CREATE TYPE public.tutor_format_preference AS ENUM ('both', 'classes_only', 'one_on_one_only');

ALTER TABLE public.profiles
  ADD COLUMN tutor_format_preference public.tutor_format_preference NOT NULL DEFAULT 'both';

CREATE INDEX idx_profiles_tutor_format_preference
  ON public.profiles(tutor_format_preference)
  WHERE role = 'tutor';

-- 2b. Ensure rating_reactions table exists (migration 051 was left empty)
CREATE TABLE IF NOT EXISTS public.rating_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id     uuid NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure helpful_count cache column on ratings
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0;

-- Add / replace reaction_type check constraint on rating_reactions
ALTER TABLE public.rating_reactions
  DROP CONSTRAINT IF EXISTS rating_reactions_reaction_type_check;
ALTER TABLE public.rating_reactions
  ADD CONSTRAINT rating_reactions_reaction_type_check
  CHECK (reaction_type IN ('like', 'dislike'));

-- Ensure one reaction per user per rating
CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_reactions_user_rating
  ON public.rating_reactions(user_id, rating_id);

-- RLS on rating_reactions (enabling here since we own the table definition)
ALTER TABLE public.rating_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read rating reactions"
  ON public.rating_reactions FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Users manage their own rating reactions"
  ON public.rating_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to keep helpful_count on ratings in sync with rating_reactions
CREATE OR REPLACE FUNCTION public.trg_sync_rating_helpful_count()
RETURNS trigger AS $$
DECLARE
  v_rating_id uuid;
BEGIN
  v_rating_id := COALESCE(NEW.rating_id, OLD.rating_id);
  UPDATE public.ratings
  SET helpful_count = (
    SELECT COUNT(*) FROM public.rating_reactions
    WHERE rating_id = v_rating_id AND reaction_type = 'like'
  )
  WHERE id = v_rating_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rating_reactions_helpful ON public.rating_reactions;
CREATE TRIGGER trg_rating_reactions_helpful
  AFTER INSERT OR UPDATE OR DELETE ON public.rating_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_rating_helpful_count();
