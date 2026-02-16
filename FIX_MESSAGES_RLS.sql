-- =====================================================
-- FIX: Messages not appearing due to RLS issue
-- =====================================================
-- The message is inserted by admin client but might not be readable by student

-- 1. Check current RLS policies on messages table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'messages'
ORDER BY policyname;

-- 2. Check if there are messages students can't see
-- This queries as superuser to see ALL messages, bypassing RLS
WITH recent_conversations AS (
    SELECT id, participant_1_id, participant_2_id
    FROM conversations
    WHERE last_message_at >= NOW() - INTERVAL '1 hour'
)
SELECT 
    'Messages that might have RLS issues' as check_type,
    m.id as message_id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    c.participant_1_id,
    c.participant_2_id,
    -- Check if conversation exists
    CASE 
        WHEN c.id IS NOT NULL THEN '✅ Conversation exists'
        ELSE '❌ Conversation missing'
    END as conversation_status,
    -- Check if sender is a participant
    CASE 
        WHEN m.sender_id = c.participant_1_id OR m.sender_id = c.participant_2_id THEN '✅ Sender is participant'
        ELSE '⚠️ Sender NOT a participant'
    END as sender_status
FROM messages m
LEFT JOIN conversations c ON c.id = m.conversation_id
WHERE m.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY m.created_at DESC;

-- 3. Verify the RLS policy logic
-- Test if a specific student can see messages in their conversation
-- Replace STUDENT_ID and CONVERSATION_ID with actual values
DO $$
DECLARE
    student_uuid uuid := 'STUDENT_ID';  -- Replace with actual student ID
    conv_uuid uuid := 'CONVERSATION_ID';  -- Replace with actual conversation ID
    can_see_conversation boolean;
    message_count int;
BEGIN
    -- Check if student is participant
    SELECT EXISTS (
        SELECT 1 FROM conversations
        WHERE id = conv_uuid
        AND (participant_1_id = student_uuid OR participant_2_id = student_uuid)
    ) INTO can_see_conversation;
    
    -- Count messages student should be able to see
    SELECT COUNT(*)
    FROM messages m
    WHERE m.conversation_id = conv_uuid
    AND EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = m.conversation_id
        AND (c.participant_1_id = student_uuid OR c.participant_2_id = student_uuid)
    )
    INTO message_count;
    
    RAISE NOTICE 'Student can see conversation: %', can_see_conversation;
    RAISE NOTICE 'Messages student can see: %', message_count;
END $$;

-- 4. FIX: Ensure messages table has correct RLS policy
-- This should already exist, but let's recreate it to be safe

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;

CREATE POLICY "Users can view messages in their conversations"
ON messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM conversations
        WHERE id = conversation_id
        AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
);

-- 5. Verify the fix worked
-- Run this after applying the policy above
SELECT 
    'Policy verification' as check_type,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'messages'
AND policyname = 'Users can view messages in their conversations';

-- 6. Test specific case: Find feedback message and check visibility
WITH latest_feedback AS (
    SELECT *
    FROM tutor_feedback
    ORDER BY created_at DESC
    LIMIT 1
),
related_conversation AS (
    SELECT c.*
    FROM conversations c, latest_feedback lf
    WHERE (c.participant_1_id = lf.tutor_id AND c.participant_2_id = lf.student_id)
       OR (c.participant_1_id = lf.student_id AND c.participant_2_id = lf.tutor_id)
    LIMIT 1
)
SELECT 
    'Feedback message visibility check' as check_type,
    lf.feedback_text,
    lf.tutor_id,
    lf.student_id,
    rc.id as conversation_id,
    rc.participant_1_id,
    rc.participant_2_id,
    COUNT(m.id) as message_count_in_conversation,
    STRING_AGG(m.content, ' | ') as message_contents
FROM latest_feedback lf
CROSS JOIN related_conversation rc
LEFT JOIN messages m ON m.conversation_id = rc.id
GROUP BY lf.feedback_text, lf.tutor_id, lf.student_id, rc.id, rc.participant_1_id, rc.participant_2_id;
