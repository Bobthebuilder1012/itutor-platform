-- =====================================================
-- Run this in Supabase Dashboard → SQL Editor → New query
-- Paste all, then click Run. Fixes: "Something went wrong" on /communities
-- =====================================================

-- 1. SUBJECT_COMMUNITIES
CREATE TABLE IF NOT EXISTS subject_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  subject_name text NOT NULL,
  form_level text NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_subject_community')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'unique_subject_community' AND relkind = 'i') THEN
    ALTER TABLE subject_communities
    ADD CONSTRAINT unique_subject_community UNIQUE (school_id, subject_name, form_level);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subject_communities_school ON subject_communities(school_id);
CREATE INDEX IF NOT EXISTS idx_subject_communities_subject_form ON subject_communities(subject_name, form_level);
CREATE INDEX IF NOT EXISTS idx_subject_communities_search ON subject_communities(school_id, subject_name, form_level);

-- 2. SUBJECT_COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS subject_community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_subject_community_member')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'unique_subject_community_member' AND relkind = 'i') THEN
    ALTER TABLE subject_community_memberships
    ADD CONSTRAINT unique_subject_community_member UNIQUE (community_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subject_memberships_user ON subject_community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_subject_memberships_community ON subject_community_memberships(community_id);

-- 3. SUBJECT_COMMUNITY_MESSAGES
DO $$ BEGIN
  CREATE TYPE subject_community_message_type AS ENUM ('student', 'system', 'pinned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS subject_community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_text text NOT NULL,
  message_type subject_community_message_type NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subject_messages_community_created ON subject_community_messages(community_id, created_at DESC);

-- 4. TRIGGER (member_count)
CREATE OR REPLACE FUNCTION subject_community_update_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE subject_communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE subject_communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subject_community_member_count ON subject_community_memberships;
CREATE TRIGGER trigger_subject_community_member_count
  AFTER INSERT OR DELETE ON subject_community_memberships
  FOR EACH ROW
  EXECUTE FUNCTION subject_community_update_member_count();

-- 5. RLS
ALTER TABLE subject_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_communities_select_policy ON subject_communities;
CREATE POLICY subject_communities_select_policy ON subject_communities
  FOR SELECT USING (
    school_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.user_is_subject_community_member(p_community_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = p_community_id AND user_id = auth.uid()); $$;

DROP POLICY IF EXISTS subject_memberships_select ON subject_community_memberships;
CREATE POLICY subject_memberships_select ON subject_community_memberships
  FOR SELECT USING (
    user_id = auth.uid() OR public.user_is_subject_community_member(community_id)
  );

DROP POLICY IF EXISTS subject_memberships_insert ON subject_community_memberships;
CREATE POLICY subject_memberships_insert ON subject_community_memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS subject_messages_select ON subject_community_messages;
CREATE POLICY subject_messages_select ON subject_community_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = subject_community_messages.community_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS subject_messages_insert ON subject_community_messages;
CREATE POLICY subject_messages_insert ON subject_community_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = subject_community_messages.community_id AND user_id = auth.uid())
    OR sender_id IS NULL
  );

-- 6. Realtime (optional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subject_community_messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime: enable subject_community_messages in Supabase Dashboard if needed';
END $$;
