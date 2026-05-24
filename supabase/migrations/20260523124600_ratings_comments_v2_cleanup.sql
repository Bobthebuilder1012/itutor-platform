-- =====================================================
-- RATINGS & COMMENTS V2 — PHASE 1: CLEANUP
-- Drop the orphaned tutor_feedback table and wipe
-- old rating data so the new schema starts clean.
-- =====================================================

-- Drop the orphaned tutor_feedback table (duplicates ratings.comment, no live use)
DROP TABLE IF EXISTS public.tutor_feedback CASCADE;

-- Wipe existing rating data so the new schema starts clean
TRUNCATE public.rating_reactions, public.ratings RESTART IDENTITY CASCADE;
