-- =====================================================
-- COMMUNITY RLS POLICIES
-- =====================================================
-- Implements row-level security for all community tables

-- =====================================================
-- COMMUNITIES TABLE POLICIES
-- =====================================================

-- Policy: Authenticated users can read all communities
DROP POLICY IF EXISTS "Authenticated users can read communities" ON communities;
CREATE POLICY "Authenticated users can read communities"
ON communities FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can create school/form communities
DROP POLICY IF EXISTS "Admins can create school communities" ON communities;
CREATE POLICY "Admins can create school communities"
ON communities FOR INSERT
TO authenticated
WITH CHECK (
  type IN ('school', 'school_form') AND (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Policy: Users can create subject_qa communities (if joinable)
DROP POLICY IF EXISTS "Users can create subject communities" ON communities;
CREATE POLICY "Users can create subject communities"
ON communities FOR INSERT
TO authenticated
WITH CHECK (
  type = 'subject_qa' AND is_joinable = true
);

-- Policy: Moderators and admins can update their communities
DROP POLICY IF EXISTS "Moderators can update communities" ON communities;
CREATE POLICY "Moderators can update communities"
ON communities FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = communities.id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = communities.id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- =====================================================
-- COMMUNITY_MEMBERSHIPS TABLE POLICIES
-- =====================================================

-- Policy: Users can read their own memberships
DROP POLICY IF EXISTS "Users can read own memberships" ON community_memberships;
CREATE POLICY "Users can read own memberships"
ON community_memberships FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Members can read other members in their communities
DROP POLICY IF EXISTS "Members can read community members" ON community_memberships;
CREATE POLICY "Members can read community members"
ON community_memberships FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = community_memberships.community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- Policy: Users can join joinable communities
DROP POLICY IF EXISTS "Users can join communities" ON community_memberships;
CREATE POLICY "Users can join communities"
ON community_memberships FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_memberships.community_id
      AND is_joinable = true
  )
);

-- Policy: Users can leave communities they joined (not auto-assigned)
DROP POLICY IF EXISTS "Users can leave communities" ON community_memberships;
CREATE POLICY "Users can leave communities"
ON community_memberships FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_memberships.community_id
      AND is_joinable = true
  )
);

-- Policy: Moderators can update member status
DROP POLICY IF EXISTS "Moderators can update memberships" ON community_memberships;
CREATE POLICY "Moderators can update memberships"
ON community_memberships FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = community_memberships.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('moderator', 'admin')
      AND cm.status = 'active'
  )
);

-- =====================================================
-- MESSAGES TABLE POLICIES (FOR Q&A)
-- =====================================================

-- Policy: Members can read questions/answers in their communities
DROP POLICY IF EXISTS "Members can read community questions" ON messages;
CREATE POLICY "Members can read community questions"
ON messages FOR SELECT
TO authenticated
USING (
  (message_type IN ('question', 'answer') AND community_id IS NOT NULL AND
   EXISTS (
     SELECT 1 FROM community_memberships
     WHERE community_id = messages.community_id
       AND user_id = auth.uid()
       AND status = 'active'
   ))
  OR
  (message_type = 'dm' OR community_id IS NULL)
);

-- Policy: Active members can create questions
DROP POLICY IF EXISTS "Active members can create questions" ON messages;
CREATE POLICY "Active members can create questions"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (message_type = 'question' AND community_id IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM community_memberships
       WHERE community_id = messages.community_id
         AND user_id = auth.uid()
         AND status = 'active'
     ))
    OR
    (message_type IN ('dm', 'answer') AND (community_id IS NULL OR 
     EXISTS (
       SELECT 1 FROM community_memberships
       WHERE community_id = messages.community_id
         AND user_id = auth.uid()
         AND status = 'active'
     )))
  )
);

-- Policy: Users can update their own messages (within 15 minutes)
DROP POLICY IF EXISTS "Users can edit own messages" ON messages;
CREATE POLICY "Users can edit own messages"
ON messages FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid()
  AND created_at > (now() - interval '15 minutes')
)
WITH CHECK (sender_id = auth.uid());

-- Policy: Moderators can update questions (pin, lock, mark best answer)
DROP POLICY IF EXISTS "Moderators can update questions" ON messages;
CREATE POLICY "Moderators can update questions"
ON messages FOR UPDATE
TO authenticated
USING (
  message_type = 'question'
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = messages.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- Policy: Authors and moderators can delete questions/answers
DROP POLICY IF EXISTS "Authors and moderators can delete" ON messages;
CREATE POLICY "Authors and moderators can delete"
ON messages FOR DELETE
TO authenticated
USING (
  (sender_id = auth.uid())
  OR
  (message_type IN ('question', 'answer') AND
   EXISTS (
     SELECT 1 FROM community_memberships
     WHERE community_id = messages.community_id
       AND user_id = auth.uid()
       AND role IN ('moderator', 'admin')
       AND status = 'active'
   ))
);

-- =====================================================
-- COMMUNITY_REPORTS TABLE POLICIES
-- =====================================================

-- Policy: Community members can create reports
DROP POLICY IF EXISTS "Members can create reports" ON community_reports;
CREATE POLICY "Members can create reports"
ON community_reports FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
);

-- Policy: Moderators and admins can read reports
DROP POLICY IF EXISTS "Moderators can read reports" ON community_reports;
CREATE POLICY "Moderators can read reports"
ON community_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Moderators can update reports (mark as reviewed)
DROP POLICY IF EXISTS "Moderators can update reports" ON community_reports;
CREATE POLICY "Moderators can update reports"
ON community_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- =====================================================
-- COMMUNITY_MOD_ACTIONS TABLE POLICIES
-- =====================================================

-- Policy: Moderators can log their own actions
DROP POLICY IF EXISTS "Moderators can create mod actions" ON community_mod_actions;
CREATE POLICY "Moderators can create mod actions"
ON community_mod_actions FOR INSERT
TO authenticated
WITH CHECK (
  moderator_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_mod_actions.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- Policy: Moderators and admins can read mod actions in their communities
DROP POLICY IF EXISTS "Moderators can read mod actions" ON community_mod_actions;
CREATE POLICY "Moderators can read mod actions"
ON community_mod_actions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_mod_actions.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Function to check if user is a moderator/admin in a community
CREATE OR REPLACE FUNCTION is_community_moderator(p_community_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = p_user_id
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user can post in a community
CREATE OR REPLACE FUNCTION can_post_in_community(p_community_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = p_user_id
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Community RLS policies created successfully';
  RAISE NOTICE '   - Communities: read by all, create/update restricted';
  RAISE NOTICE '   - Memberships: users can join/leave joinable communities';
  RAISE NOTICE '   - Messages: members can read/post, moderators can moderate';
  RAISE NOTICE '   - Reports: members can report, moderators can review';
  RAISE NOTICE '   - Mod Actions: moderators can create/read';
  RAISE NOTICE '   - Helper functions for permission checks';
END $$;






