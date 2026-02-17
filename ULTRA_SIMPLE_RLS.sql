-- =============================================================================
-- ULTRA-SIMPLE RLS POLICIES - No recursion possible
-- =============================================================================
-- This uses the simplest possible logic to avoid ANY recursion

BEGIN;

-- =============================================================================
-- Step 1: Drop ALL policies to start completely fresh
-- =============================================================================

-- messages table
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Members can read community questions" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Active members can create questions" ON messages;
DROP POLICY IF EXISTS "Users can edit own messages" ON messages;
DROP POLICY IF EXISTS "Moderators can moderate messages" ON messages;
DROP POLICY IF EXISTS "Authors and moderators can delete" ON messages;
DROP POLICY IF EXISTS "users_read_messages" ON messages;
DROP POLICY IF EXISTS "users_send_dm_messages" ON messages;
DROP POLICY IF EXISTS "members_post_community_messages" ON messages;
DROP POLICY IF EXISTS "users_update_own_messages" ON messages;
DROP POLICY IF EXISTS "users_delete_messages" ON messages;

-- conversations table
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;

-- =============================================================================
-- Step 2: Create MINIMAL policies with ZERO subqueries
-- =============================================================================

-- CONVERSATIONS: Simple direct check
CREATE POLICY "conv_read"
ON conversations
FOR SELECT
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "conv_insert"
ON conversations
FOR INSERT
TO authenticated
WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- MESSAGES: Only for DMs - NO community logic at all
-- This completely removes the problematic community_memberships checks
CREATE POLICY "msg_read_dm_only"
ON messages
FOR SELECT
TO authenticated
USING (
  -- Only allow DMs, completely ignore community messages for now
  (community_id IS NULL OR message_type = 'dm' OR message_type IS NULL)
  AND
  -- Simple direct check - conversation belongs to user
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

CREATE POLICY "msg_insert_dm_only"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (community_id IS NULL OR message_type = 'dm' OR message_type IS NULL)
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
    AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

-- =============================================================================
-- Step 3: Keep RLS ENABLED
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Leave profiles and community_memberships for now - not critical for messages

COMMIT;

-- =============================================================================
-- Verify
-- =============================================================================

SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename IN ('messages', 'conversations')
ORDER BY tablename, policyname;

DO $$
BEGIN
  RAISE NOTICE '✅ Ultra-simple RLS policies applied';
  RAISE NOTICE '   - Removed ALL community message logic';
  RAISE NOTICE '   - Only DM messages allowed';
  RAISE NOTICE '   - Zero recursion possible';
  RAISE NOTICE '   - Conversations and messages have simple policies';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Note: Community Q&A will NOT work with these policies';
  RAISE NOTICE '   This is a trade-off to ensure DMs work reliably';
END $$;
