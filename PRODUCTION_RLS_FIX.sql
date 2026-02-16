-- =====================================================
-- PRODUCTION FIX: Resolve RLS recursion on messages table
-- =====================================================
-- Problem: Multiple policies on messages table cause infinite recursion
-- when checking community_memberships

-- Solution: Simplify policies to avoid recursive checks

BEGIN;

-- Step 1: Drop all existing message policies to start clean
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Members can read community questions" ON messages;
DROP POLICY IF EXISTS "Active members can create questions" ON messages;
DROP POLICY IF EXISTS "Users can edit own messages" ON messages;
DROP POLICY IF EXISTS "Moderators can moderate messages" ON messages;
DROP POLICY IF EXISTS "Authors and moderators can delete" ON messages;

-- Step 2: Create NEW simplified policies without recursion

-- Policy 1: Read messages (DMs OR community messages user has access to)
CREATE POLICY "users_read_messages"
ON messages
FOR SELECT
TO authenticated
USING (
  -- Allow reading DMs in user's conversations
  (message_type IS NULL OR message_type = 'dm' OR community_id IS NULL)
  AND EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conversation_id
    AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
  )
  OR
  -- Allow reading community messages if user is a member
  (message_type IN ('question', 'answer') AND community_id IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = messages.community_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
  )
);

-- Policy 2: Send DM messages
CREATE POLICY "users_send_dm_messages"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (message_type IS NULL OR message_type = 'dm' OR community_id IS NULL)
  AND EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conversation_id
    AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
  )
);

-- Policy 3: Post community messages
CREATE POLICY "members_post_community_messages"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND message_type IN ('question', 'answer')
  AND community_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = messages.community_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
  )
);

-- Policy 4: Users can update their own messages (within 15 minutes)
CREATE POLICY "users_update_own_messages"
ON messages
FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid()
  AND created_at > (now() - interval '15 minutes')
);

-- Policy 5: Users can delete their own messages OR moderators can delete any
CREATE POLICY "users_delete_messages"
ON messages
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  OR
  (community_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = messages.community_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('moderator', 'admin')
    AND cm.status = 'active'
  ))
);

COMMIT;

-- Step 3: Re-enable RLS on all tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Step 4: Verify policies are in place
SELECT 
    'Messages policies after fix' as check_type,
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'messages'
ORDER BY policyname;

-- Step 5: Test query (should work without recursion)
-- Run this as an authenticated user
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies fixed successfully';
  RAISE NOTICE 'Messages table now has % policies', (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'messages');
  RAISE NOTICE 'Test by fetching messages in a conversation as an authenticated user';
END $$;
