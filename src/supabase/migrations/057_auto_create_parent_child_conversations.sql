-- =====================================================
-- AUTO-CREATE CONVERSATIONS BETWEEN PARENTS AND CHILDREN
-- =====================================================
-- This migration ensures parents always have an open DM with each of their children
-- Creates a conversation automatically when a parent_child_link is established

BEGIN;

-- =====================================================
-- FUNCTION: Create conversation between parent and child
-- =====================================================
CREATE OR REPLACE FUNCTION create_parent_child_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id uuid;
    v_parent_name text;
    v_child_name text;
BEGIN
    -- Get display names for initial message
    SELECT COALESCE(display_name, username, full_name, 'Parent') 
    INTO v_parent_name
    FROM public.profiles
    WHERE id = NEW.parent_id;

    SELECT COALESCE(display_name, username, full_name, 'Child')
    INTO v_child_name
    FROM public.profiles
    WHERE id = NEW.child_id;

    -- Check if conversation already exists
    -- (in case this is a re-linking or manual creation)
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE (participant_1_id = NEW.parent_id AND participant_2_id = NEW.child_id)
       OR (participant_1_id = NEW.child_id AND participant_2_id = NEW.parent_id);

    -- If conversation doesn't exist, create it
    IF v_conversation_id IS NULL THEN
        -- Create the conversation
        INSERT INTO public.conversations (
            participant_1_id,
            participant_2_id,
            conversation_type,
            last_message_at,
            last_message_preview,
            created_at,
            updated_at
        ) VALUES (
            NEW.parent_id,
            NEW.child_id,
            'dm',
            NOW(),
            'Start chatting with your ' || 
                CASE 
                    WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.parent_id) 
                    THEN CASE 
                        WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.child_id AND role = 'student') 
                        THEN 'child'
                        ELSE 'parent'
                    END
                    ELSE 'family member'
                END,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_conversation_id;

        -- Create welcome message
        INSERT INTO public.messages (
            conversation_id,
            sender_id,
            content,
            message_type,
            created_at,
            updated_at
        ) VALUES (
            v_conversation_id,
            NEW.parent_id, -- Message from parent
            'Hi ' || v_child_name || '! 👋 This is our private chat. I can see your bookings and help you with your tutoring sessions here.',
            'dm',
            NOW(),
            NOW()
        );

        RAISE NOTICE 'Created conversation % between parent % and child %', 
            v_conversation_id, NEW.parent_id, NEW.child_id;
    ELSE
        RAISE NOTICE 'Conversation already exists between parent % and child %', 
            NEW.parent_id, NEW.child_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Auto-create conversation on parent-child link
-- =====================================================
DROP TRIGGER IF EXISTS trigger_create_parent_child_conversation ON public.parent_child_links;

CREATE TRIGGER trigger_create_parent_child_conversation
    AFTER INSERT ON public.parent_child_links
    FOR EACH ROW
    EXECUTE FUNCTION create_parent_child_conversation();

-- =====================================================
-- BACKFILL: Create conversations for existing parent-child relationships
-- =====================================================
DO $$
DECLARE
    link_record RECORD;
    v_conversation_id uuid;
    v_parent_name text;
    v_child_name text;
    v_created_count integer := 0;
    v_existing_count integer := 0;
BEGIN
    RAISE NOTICE 'Starting backfill of parent-child conversations...';

    FOR link_record IN 
        SELECT parent_id, child_id, created_at
        FROM public.parent_child_links
        ORDER BY created_at
    LOOP
        -- Get display names
        SELECT COALESCE(display_name, username, full_name, 'Parent') 
        INTO v_parent_name
        FROM public.profiles
        WHERE id = link_record.parent_id;

        SELECT COALESCE(display_name, username, full_name, 'Child')
        INTO v_child_name
        FROM public.profiles
        WHERE id = link_record.child_id;

        -- Check if conversation exists
        SELECT id INTO v_conversation_id
        FROM public.conversations
        WHERE (participant_1_id = link_record.parent_id AND participant_2_id = link_record.child_id)
           OR (participant_1_id = link_record.child_id AND participant_2_id = link_record.parent_id);

        IF v_conversation_id IS NULL THEN
            -- Create conversation
            INSERT INTO public.conversations (
                participant_1_id,
                participant_2_id,
                conversation_type,
                last_message_at,
                last_message_preview,
                created_at,
                updated_at
            ) VALUES (
                link_record.parent_id,
                link_record.child_id,
                'dm',
                link_record.created_at,
                'Start chatting with your child',
                link_record.created_at,
                link_record.created_at
            )
            RETURNING id INTO v_conversation_id;

            -- Create welcome message
            INSERT INTO public.messages (
                conversation_id,
                sender_id,
                content,
                message_type,
                created_at,
                updated_at
            ) VALUES (
                v_conversation_id,
                link_record.parent_id,
                'Hi ' || v_child_name || '! 👋 This is our private chat. I can see your bookings and help you with your tutoring sessions here.',
                'dm',
                link_record.created_at,
                link_record.created_at
            );

            v_created_count := v_created_count + 1;
            RAISE NOTICE 'Created conversation for parent % and child %', 
                link_record.parent_id, link_record.child_id;
        ELSE
            v_existing_count := v_existing_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill complete: Created % new conversations, % already existed', 
        v_created_count, v_existing_count;
END $$;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify all parent-child links have conversations:
/*
SELECT 
    pcl.parent_id,
    pp.full_name as parent_name,
    pcl.child_id,
    cp.full_name as child_name,
    CASE 
        WHEN c.id IS NOT NULL THEN 'Has Conversation ✓'
        ELSE 'Missing Conversation ✗'
    END as conversation_status,
    c.id as conversation_id
FROM parent_child_links pcl
JOIN profiles pp ON pp.id = pcl.parent_id
JOIN profiles cp ON cp.id = pcl.child_id
LEFT JOIN conversations c ON 
    (c.participant_1_id = pcl.parent_id AND c.participant_2_id = pcl.child_id)
    OR (c.participant_1_id = pcl.child_id AND c.participant_2_id = pcl.parent_id)
ORDER BY pp.full_name, cp.full_name;
*/

COMMIT;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
/*
BEGIN;

-- Remove trigger
DROP TRIGGER IF EXISTS trigger_create_parent_child_conversation ON public.parent_child_links;

-- Remove function
DROP FUNCTION IF EXISTS create_parent_child_conversation();

-- Optionally, remove auto-created conversations
-- (CAREFUL: This will delete all parent-child conversations!)
-- DELETE FROM public.conversations
-- WHERE conversation_type = 'dm'
-- AND EXISTS (
--     SELECT 1 FROM public.parent_child_links
--     WHERE (parent_id = conversations.participant_1_id AND child_id = conversations.participant_2_id)
--        OR (parent_id = conversations.participant_2_id AND child_id = conversations.participant_1_id)
-- );

COMMIT;
*/





