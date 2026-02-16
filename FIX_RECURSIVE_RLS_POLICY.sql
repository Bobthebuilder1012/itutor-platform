-- =====================================================
-- FIX: Infinite recursion in RLS policies
-- =====================================================
-- The error "infinite recursion detected in policy for relation 'community_memberships'"
-- suggests that RLS policies are recursively checking each other

-- Step 1: Check all policies on messages table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'messages'
ORDER BY policyname;

-- Step 2: Check all policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Step 3: Check all policies on community_memberships table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'community_memberships'
ORDER BY policyname;

-- Step 4: Temporarily disable RLS on messages (for testing)
-- CAUTION: Only run this temporarily to test!
-- ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Step 5: Fix - Create a non-recursive policy for messages
-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;

-- Recreate with simpler, non-recursive logic
CREATE POLICY "Users can view messages in their conversations"
ON messages
FOR SELECT
TO authenticated
USING (
    -- Direct check without nested subqueries
    conversation_id IN (
        SELECT id FROM conversations
        WHERE participant_1_id = auth.uid() 
           OR participant_2_id = auth.uid()
    )
);

-- Step 6: Verify the fix
SELECT 
    'After fix - Messages policy' as check_type,
    policyname,
    qual
FROM pg_policies
WHERE tablename = 'messages'
AND policyname = 'Users can view messages in their conversations';

-- Step 7: Test query (run as authenticated user)
-- This should now work without recursion errors
SELECT 
    m.id,
    m.content,
    m.created_at,
    m.sender_id
FROM messages m
WHERE m.conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY m.created_at;
