-- =====================================================
-- DELETE ALL TEST USERS
-- =====================================================
-- Comprehensive script to delete all test users and their associated data
-- Handles foreign key constraints by deleting in correct order
-- =====================================================

DO $$
DECLARE
    test_user_ids UUID[];
    deleted_count INTEGER;
BEGIN
    -- Step 1: Identify all test users where is_test_data = true
    SELECT ARRAY_AGG(id) INTO test_user_ids
    FROM profiles
    WHERE is_test_data = true;

    IF test_user_ids IS NULL OR ARRAY_LENGTH(test_user_ids, 1) IS NULL THEN
        RAISE NOTICE '✅ No test users found to delete';
        RETURN;
    END IF;

    RAISE NOTICE 'Found % test users to delete', ARRAY_LENGTH(test_user_ids, 1);

    -- Step 2: Delete bookings first (so we can clean up messages after)
    DELETE FROM bookings 
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % bookings', deleted_count;

    -- Step 3: Delete booking_messages (after bookings are gone)
    DELETE FROM booking_messages WHERE sender_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % booking_messages', deleted_count;

    -- Step 4: Delete notifications
    DELETE FROM notifications WHERE user_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % notifications', deleted_count;

    -- Step 5: Delete ratings
    DELETE FROM ratings 
    WHERE student_id = ANY(test_user_ids)
       OR tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % ratings', deleted_count;

    -- Step 6: Delete conversations
    DELETE FROM conversations 
    WHERE participant_1_id = ANY(test_user_ids)
       OR participant_2_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % conversations', deleted_count;

    -- Step 7: Delete lesson_offers
    DELETE FROM lesson_offers 
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % lesson_offers', deleted_count;

    -- Step 8: Delete sessions
    DELETE FROM sessions 
    WHERE tutor_id = ANY(test_user_ids)
       OR student_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % sessions', deleted_count;

    -- Step 9: Delete payment-related records
    DELETE FROM commission_ledger WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % commission_ledger records', deleted_count;

    DELETE FROM tutor_balances WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_balances records', deleted_count;

    DELETE FROM tutor_earnings WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_earnings records', deleted_count;

    DELETE FROM payments WHERE payer_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % payments', deleted_count;

    -- Step 10: Delete tutor-specific records
    DELETE FROM tutor_subjects WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_subjects', deleted_count;

    DELETE FROM tutor_video_provider_connections WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_video_provider_connections', deleted_count;

    DELETE FROM tutor_verified_subject_grades WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_verified_subject_grades', deleted_count;

    DELETE FROM tutor_verifications WHERE tutor_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_verifications', deleted_count;

    -- Step 10: Delete parent-child relationships
    DELETE FROM parent_child_links 
    WHERE parent_id = ANY(test_user_ids)
       OR child_id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % parent_child_links', deleted_count;

    -- Step 11: Delete profiles
    DELETE FROM profiles WHERE id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % profiles', deleted_count;

    -- Step 12: Delete from auth.users
    DELETE FROM auth.users WHERE id = ANY(test_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % auth.users', deleted_count;

    RAISE NOTICE '✅ Test user cleanup complete!';
END $$;
