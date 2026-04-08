-- =====================================================
-- SUBJECT COMMUNITY PINNED SESSIONS (spec Phase 5)
-- Pinned sessions appear in sub-community right panel / drawer.
-- =====================================================

CREATE TABLE IF NOT EXISTS subject_community_pinned_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_sessions_community_session
  ON subject_community_pinned_sessions(community_id, session_id);
CREATE INDEX IF NOT EXISTS idx_pinned_sessions_community_expires
  ON subject_community_pinned_sessions(community_id, expires_at);

COMMENT ON TABLE subject_community_pinned_sessions IS 'Sessions pinned to a subject community; visible to members until expires_at';

-- RLS: only community members can read
ALTER TABLE subject_community_pinned_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_pinned_sessions_select ON subject_community_pinned_sessions;
CREATE POLICY subject_pinned_sessions_select ON subject_community_pinned_sessions
  FOR SELECT USING (
    public.user_is_subject_community_member(community_id)
  );

-- Only service role / backend can insert (teacher accepts session flow)
DROP POLICY IF EXISTS subject_pinned_sessions_insert ON subject_community_pinned_sessions;
CREATE POLICY subject_pinned_sessions_insert ON subject_community_pinned_sessions
  FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  RAISE NOTICE '✅ Subject community pinned sessions migration 091 applied';
END $$;
