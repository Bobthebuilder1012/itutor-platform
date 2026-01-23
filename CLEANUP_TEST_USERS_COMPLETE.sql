-- =====================================================
-- COMPLETE TEST USER CLEANUP
-- =====================================================
-- Deletes all test user records in the correct order
-- to respect foreign key constraints

-- Step 1: Find the user IDs we want to delete
DO $$
DECLARE
    test_user_ids UUID[];
BEGIN
    -- Get all test user IDs
    SELECT ARRAY_AGG(id) INTO test_user_ids
    FROM profiles
    WHERE username IN ('liamrampersd1', 'liamramps', 'liamrampersd12')
       OR email LIKE '%liamdhruvr%' 
       OR email LIKE '%liamrampersd%';

    RAISE NOTICE 'Found % test users to delete', ARRAY_LENGTH(test_user_ids, 1);

    -- Step 2: Delete booking_messages (references profiles via sender_id)
    DELETE FROM booking_messages
    WHERE sender_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted booking_messages';

    -- Step 3: Delete notifications (references profiles via user_id)
    DELETE FROM notifications
    WHERE user_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted notifications';

    -- Step 4: Delete ratings (references profiles via student_id and tutor_id)
    DELETE FROM ratings
    WHERE student_id = ANY(test_user_ids)
       OR tutor_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted ratings';

    -- Step 5: Delete conversations (references profiles via participant IDs)
    DELETE FROM conversations
    WHERE participant_1_id = ANY(test_user_ids)
       OR participant_2_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted conversations';

    -- Step 6: Delete lesson_offers (references profiles via tutor_id and student_id)
    DELETE FROM lesson_offers
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted lesson_offers';

    -- Step 7: Delete sessions (references profiles via tutor_id and student_id)
    DELETE FROM sessions
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted sessions';

    -- Step 8: Delete bookings (references profiles via tutor_id and student_id)
    DELETE FROM bookings
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted bookings';

    -- Step 9: Delete tutor-specific records
    DELETE FROM tutor_subjects WHERE tutor_id = ANY(test_user_ids);
    DELETE FROM tutor_video_provider_connections WHERE tutor_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted tutor-specific records';

    -- Step 10: Delete parent-child relationships
    DELETE FROM parent_child_links
    WHERE parent_id = ANY(test_user_ids)
       OR child_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted parent_child_links';

    -- Step 11: Delete verification records
    DELETE FROM tutor_verification_documents WHERE tutor_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted verification documents';

    -- Step 12: Now safe to delete profiles
    DELETE FROM profiles WHERE id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted profiles';

    -- Step 13: Delete from auth.users (if you have permission)
    DELETE FROM auth.users
    WHERE email LIKE '%liamdhruvr%' 
       OR email LIKE '%liamrampersd%';
    RAISE NOTICE 'Deleted auth.users';

    RAISE NOTICE '✅ Test user cleanup complete!';
END $$;
