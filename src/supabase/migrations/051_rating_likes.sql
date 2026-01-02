-- =====================================================
-- RATING LIKES/DISLIKES SYSTEM
-- =====================================================
-- Allow users to like or dislike rating comments
-- Track popularity for sorting comments by most helpful
-- =====================================================

-- Create rating_reactions table
CREATE TABLE IF NOT EXISTS public.rating_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id UUID NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One reaction per user per rating
  CONSTRAINT unique_user_rating_reaction UNIQUE (rating_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_rating_reactions_rating ON public.rating_reactions(rating_id);
CREATE INDEX idx_rating_reactions_user ON public.rating_reactions(user_id);
CREATE INDEX idx_rating_reactions_type ON public.rating_reactions(reaction_type);

-- Add helpful_count column to ratings table for caching
ALTER TABLE public.ratings
ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0;

-- Create index on helpful_count for sorting
CREATE INDEX IF NOT EXISTS idx_ratings_helpful_count ON public.ratings(helpful_count DESC);

-- Function to update helpful_count
CREATE OR REPLACE FUNCTION update_rating_helpful_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate helpful_count for the affected rating
  UPDATE public.ratings
  SET helpful_count = (
    SELECT COUNT(*) FILTER (WHERE reaction_type = 'like') - 
           COUNT(*) FILTER (WHERE reaction_type = 'dislike')
    FROM public.rating_reactions
    WHERE rating_id = COALESCE(NEW.rating_id, OLD.rating_id)
  )
  WHERE id = COALESCE(NEW.rating_id, OLD.rating_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update helpful_count when reactions change
DROP TRIGGER IF EXISTS trigger_update_rating_helpful_count ON public.rating_reactions;
CREATE TRIGGER trigger_update_rating_helpful_count
AFTER INSERT OR UPDATE OR DELETE ON public.rating_reactions
FOR EACH ROW
EXECUTE FUNCTION update_rating_helpful_count();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.rating_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read reactions
CREATE POLICY "Anyone can read rating reactions"
ON public.rating_reactions
FOR SELECT
USING (true);

-- Allow authenticated users to create reactions
CREATE POLICY "Authenticated users can create reactions"
ON public.rating_reactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own reactions
CREATE POLICY "Users can update own reactions"
ON public.rating_reactions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own reactions
CREATE POLICY "Users can delete own reactions"
ON public.rating_reactions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- =====================================================
-- INITIAL DATA MIGRATION
-- =====================================================
-- Update helpful_count for existing ratings
UPDATE public.ratings
SET helpful_count = 0
WHERE helpful_count IS NULL;

