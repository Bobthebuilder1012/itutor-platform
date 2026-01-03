-- =====================================================
-- COMMUNITY MODERATION SYSTEM
-- =====================================================
-- Creates tables for reports and moderator actions

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE report_target_type AS ENUM ('question', 'answer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM (
    'spam',
    'harassment',
    'inappropriate',
    'off_platform_payments',
    'misinformation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mod_action_type AS ENUM (
    'restrict_user',
    'timeout_user',
    'ban_user',
    'unban_user',
    'remove_question',
    'remove_answer',
    'lock_question',
    'unlock_question',
    'pin_question',
    'unpin_question',
    'mark_best_answer',
    'update_community_profile'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE COMMUNITY_REPORTS TABLE
CREATE TABLE IF NOT EXISTS community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id uuid NOT NULL, -- ID of the question or answer message
  reason report_reason NOT NULL,
  details text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate reports from same user for same target
  CONSTRAINT unique_user_target_report UNIQUE (reporter_id, target_id)
);

-- 3. CREATE INDEXES FOR REPORTS
CREATE INDEX IF NOT EXISTS idx_reports_target ON community_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_community ON community_reports(community_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON community_reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_created ON community_reports(created_at DESC);

-- 4. CREATE COMMUNITY_MOD_ACTIONS TABLE
CREATE TABLE IF NOT EXISTS community_mod_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  moderator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type mod_action_type NOT NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_id uuid, -- ID of question/answer if applicable
  reason text,
  metadata jsonb, -- Additional data (e.g., timeout duration, previous status)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. CREATE INDEXES FOR MOD ACTIONS
CREATE INDEX IF NOT EXISTS idx_mod_actions_community ON community_mod_actions(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_moderator ON community_mod_actions(moderator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target_user ON community_mod_actions(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_type ON community_mod_actions(action_type, created_at DESC);

-- 6. CREATE FUNCTION TO LOG MODERATION ACTIONS
CREATE OR REPLACE FUNCTION log_mod_action(
  p_community_id uuid,
  p_moderator_id uuid,
  p_action_type mod_action_type,
  p_target_user_id uuid DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_action_id uuid;
BEGIN
  INSERT INTO community_mod_actions (
    community_id,
    moderator_id,
    action_type,
    target_user_id,
    target_id,
    reason,
    metadata
  ) VALUES (
    p_community_id,
    p_moderator_id,
    p_action_type,
    p_target_user_id,
    p_target_id,
    p_reason,
    p_metadata
  ) RETURNING id INTO v_action_id;
  
  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ENABLE RLS
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_mod_actions ENABLE ROW LEVEL SECURITY;

-- 8. COMMENTS
COMMENT ON TABLE community_reports IS 'User reports of inappropriate questions or answers';
COMMENT ON TABLE community_mod_actions IS 'Log of all moderation actions taken in communities';

COMMENT ON COLUMN community_reports.target_type IS 'Type of content being reported: question or answer';
COMMENT ON COLUMN community_reports.target_id IS 'ID of the message (question or answer) being reported';
COMMENT ON COLUMN community_reports.reason IS 'Reason for report: spam, harassment, inappropriate, etc.';
COMMENT ON COLUMN community_reports.status IS 'Report status: pending, reviewing, resolved, dismissed';

COMMENT ON COLUMN community_mod_actions.action_type IS 'Type of moderation action taken';
COMMENT ON COLUMN community_mod_actions.target_user_id IS 'User affected by the action (if applicable)';
COMMENT ON COLUMN community_mod_actions.target_id IS 'Question/answer affected by the action (if applicable)';
COMMENT ON COLUMN community_mod_actions.metadata IS 'Additional action data in JSON format';

COMMENT ON FUNCTION log_mod_action IS 'Helper function to log moderation actions';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Community moderation system created';
  RAISE NOTICE '   - community_reports table with status tracking';
  RAISE NOTICE '   - community_mod_actions table for audit log';
  RAISE NOTICE '   - Helper function log_mod_action() for logging';
  RAISE NOTICE '   - RLS enabled (policies in separate migration)';
END $$;





