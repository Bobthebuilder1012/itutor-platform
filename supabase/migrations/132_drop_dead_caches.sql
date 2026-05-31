-- =============================================================================
-- 132: Drop dead cache tables and unused RPC
-- =============================================================================
-- Removes write-only/unused tables identified in post-127/128/129 audit.
--
-- 1. tutor_profiles (mig 094)
--    - Created as a cached profile aggregate (bio, education, average_rating,
--      total_reviews, etc.).
--    - Only writer:  lib/services/groupReviews.ts (recalculateRating).
--    - No readers: every UI site (find-tutors, search, tutors/[id], etc.)
--      computes average_rating / total_reviews on the fly from `ratings` and
--      `group_reviews`. The cached values are never consulted.
--    - Profile-level fields (bio, education, social_links, etc.) live on
--      `profiles`. This table is a vestigial duplicate.
--
-- 2. tutor_response_metrics + update_tutor_response_metrics()  (mig 010 + 013)
--    - Designed to display avg first-response time on tutor profiles.
--    - getTutorResponseMetrics() export in bookingService.ts is never called.
--    - update_tutor_response_metrics() RPC is never invoked from app code.
--    - Active source of tutor response time is `profiles.response_time_minutes`
--      (manually set by tutor; joined via profiles in 6+ places).
--
-- Safety: DROP TABLE ... CASCADE removes attached indexes, RLS policies,
-- and FK constraints. No triggers depend on either table.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) tutor_profiles
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.tutor_profiles CASCADE;

-- ---------------------------------------------------------------------------
-- 2) tutor_response_metrics + RPC
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_tutor_response_metrics(uuid);
DROP TABLE IF EXISTS public.tutor_response_metrics CASCADE;

COMMIT;

-- =============================================================================
-- Post-deploy code cleanup (committed in this same change):
--   - lib/services/groupReviews.ts            (deleted)
--   - app/api/reviews/[reviewId]/route.ts     (recalculateRating removed)
--   - app/api/groups/[groupId]/reviews/route.ts (recalculateRating removed)
--   - lib/services/bookingService.ts          (getTutorResponseMetrics removed)
--   - lib/types/booking.ts                    (TutorResponseMetrics removed)
-- =============================================================================
