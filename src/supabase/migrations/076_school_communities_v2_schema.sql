-- =====================================================
-- SCHOOL COMMUNITIES V2 - SCHEMA
-- One public School Community per institution; separate from v1 communities/messages
-- =====================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE school_community_member_status AS ENUM ('ACTIVE', 'LEFT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE school_community_member_role AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. SCHOOL_COMMUNITIES (one per institution)
CREATE TABLE IF NOT EXISTS school_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'SCHOOL' CHECK (type = 'SCHOOL'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_communities_school_id ON school_communities(school_id);

COMMENT ON TABLE school_communities IS 'One public School Community per institution (v2)';

-- 3. SCHOOL_COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS school_community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES school_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status school_community_member_status NOT NULL DEFAULT 'ACTIVE',
  muted boolean NOT NULL DEFAULT false,
  role school_community_member_role NOT NULL DEFAULT 'MEMBER',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT unique_school_community_member UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_school_community_memberships_community_id ON school_community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_school_community_memberships_user_id ON school_community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_school_community_memberships_status ON school_community_memberships(status);

COMMENT ON TABLE school_community_memberships IS 'User membership in school communities (v2)';

-- 4. SCHOOL_COMMUNITY_MESSAGES (threads via parent_message_id)
CREATE TABLE IF NOT EXISTS school_community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES school_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES school_community_messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_community_messages_community_id ON school_community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_school_community_messages_parent_message_id ON school_community_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_school_community_messages_created_at ON school_community_messages(created_at DESC);

COMMENT ON TABLE school_community_messages IS 'Feed and thread messages for school communities (v2); separate from messages/DM';

-- 5. UPDATED_AT TRIGGER FOR MESSAGES
CREATE OR REPLACE FUNCTION school_community_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_school_community_messages_updated_at ON school_community_messages;
CREATE TRIGGER trigger_school_community_messages_updated_at
  BEFORE UPDATE ON school_community_messages
  FOR EACH ROW
  EXECUTE FUNCTION school_community_messages_updated_at();
