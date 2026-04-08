-- =====================================================
-- Add community_id to bookings and sessions (spec Phase 4/5)
-- =====================================================

-- Bookings: optional community when student books a "Community Session"
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES subject_communities(id) ON DELETE SET NULL;

-- Sessions: link to community when session is a community session (for pinned display)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES subject_communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_community ON public.bookings(community_id);
CREATE INDEX IF NOT EXISTS idx_sessions_community ON public.sessions(community_id);

COMMENT ON COLUMN public.bookings.community_id IS 'Set when student selects a community for a community session';
COMMENT ON COLUMN public.sessions.community_id IS 'Set from booking when session is for a community; used for pinned sessions';

DO $$
BEGIN
  RAISE NOTICE '✅ Communities booking/session columns migration 092 applied';
END $$;
