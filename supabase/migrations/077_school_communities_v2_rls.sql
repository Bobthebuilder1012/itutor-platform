-- =====================================================
-- SCHOOL COMMUNITIES V2 - RLS POLICIES
-- =====================================================

-- Helper: current user's institution_id (for RLS)
CREATE OR REPLACE FUNCTION public.user_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Enable RLS on all three tables
ALTER TABLE school_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITIES
-- ---------------------------------------------------------------------------
-- SELECT: only community for user's school
CREATE POLICY "school_communities_select_own_school"
ON school_communities FOR SELECT
TO authenticated
USING (school_id = public.user_institution_id());

-- No INSERT/UPDATE/DELETE for users; use service role in app

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITY_MEMBERSHIPS
-- ---------------------------------------------------------------------------
-- SELECT: memberships for communities that belong to user's school
CREATE POLICY "school_community_memberships_select_own_school"
ON school_community_memberships FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_memberships.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

-- INSERT: rejoin - only for own school's community, self only
CREATE POLICY "school_community_memberships_insert_rejoin"
ON school_community_memberships FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = community_id AND sc.school_id = public.user_institution_id()
  )
);

-- UPDATE: own row only (status, muted, left_at, joined_at for leave/rejoin)
CREATE POLICY "school_community_memberships_update_own"
ON school_community_memberships FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITY_MESSAGES
-- ---------------------------------------------------------------------------
-- SELECT: messages in communities that belong to user's school
CREATE POLICY "school_community_messages_select_own_school"
ON school_community_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_messages.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

-- INSERT: only if community is user's school AND user has ACTIVE membership
CREATE POLICY "school_community_messages_insert_active_member"
ON school_community_messages FOR INSERT
TO authenticated
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

-- UPDATE: own messages (content/edit); pin/unpin only for ADMIN or platform admin
CREATE POLICY "school_community_messages_update_own"
ON school_community_messages FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- UPDATE: allow pin/unpin for community ADMIN or platform admin (role/is_reviewer)
CREATE POLICY "school_community_messages_update_pin_admin"
ON school_community_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_community_memberships m
    JOIN public.profiles p ON p.id = auth.uid()
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

-- DELETE: own messages only
CREATE POLICY "school_community_messages_delete_own"
ON school_community_messages FOR DELETE
TO authenticated
USING (user_id = auth.uid());
