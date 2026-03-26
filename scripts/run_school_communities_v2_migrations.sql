-- =====================================================
-- SCHOOL COMMUNITIES V2 - RUN IN SUPABASE SQL EDITOR
-- =====================================================
-- Copy and run this entire file in: Supabase Dashboard > SQL Editor > New query
-- Then click "Run". After it succeeds, refresh /community and click "Try again".

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

COMMENT ON TABLE school_community_messages IS 'Feed and thread messages for school communities (v2)';

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
  EXECUTE PROCEDURE school_community_messages_updated_at();

-- 6. RLS HELPER
CREATE OR REPLACE FUNCTION public.user_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 7. ENABLE RLS
ALTER TABLE school_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_messages ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES
DROP POLICY IF EXISTS "school_communities_select_own_school" ON school_communities;
CREATE POLICY "school_communities_select_own_school"
ON school_communities FOR SELECT TO authenticated
USING (school_id = public.user_institution_id());

DROP POLICY IF EXISTS "school_community_memberships_select_own_school" ON school_community_memberships;
CREATE POLICY "school_community_memberships_select_own_school"
ON school_community_memberships FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_memberships.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

DROP POLICY IF EXISTS "school_community_memberships_insert_rejoin" ON school_community_memberships;
CREATE POLICY "school_community_memberships_insert_rejoin"
ON school_community_memberships FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = community_id AND sc.school_id = public.user_institution_id()
  )
);

DROP POLICY IF EXISTS "school_community_memberships_update_own" ON school_community_memberships;
CREATE POLICY "school_community_memberships_update_own"
ON school_community_memberships FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "school_community_messages_select_own_school" ON school_community_messages;
CREATE POLICY "school_community_messages_select_own_school"
ON school_community_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_messages.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

DROP POLICY IF EXISTS "school_community_messages_insert_active_member" ON school_community_messages;
CREATE POLICY "school_community_messages_insert_active_member"
ON school_community_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = community_id AND sc.school_id = public.user_institution_id()
  )
  AND EXISTS (
    SELECT 1 FROM school_community_memberships m
    WHERE m.community_id = school_community_messages.community_id
    AND m.user_id = auth.uid()
    AND m.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "school_community_messages_update_own" ON school_community_messages;
CREATE POLICY "school_community_messages_update_own"
ON school_community_messages FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "school_community_messages_update_pin_admin" ON school_community_messages;
CREATE POLICY "school_community_messages_update_pin_admin"
ON school_community_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_community_memberships m
    WHERE m.community_id = school_community_messages.community_id
    AND m.user_id = auth.uid()
    AND m.role = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND (p.role = 'admin' OR p.is_reviewer = true)
  )
)
WITH CHECK (true);

DROP POLICY IF EXISTS "school_community_messages_delete_own" ON school_community_messages;
CREATE POLICY "school_community_messages_delete_own"
ON school_community_messages FOR DELETE TO authenticated
USING (user_id = auth.uid());
