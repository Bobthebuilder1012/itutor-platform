-- =====================================================
-- DELETE SPECIFIC USER
-- =====================================================
-- Deletes a specific user and their associated data
-- =====================================================

DO $$
DECLARE
    target_user_id UUID;
    deleted_count INTEGER;
BEGIN
    -- Find user by email
    SELECT id INTO target_user_id
    FROM profiles
    WHERE email = 'alejandrolee@myitutor.com';

    IF target_user_id IS NULL THEN
        RAISE NOTICE '❌ User not found';
        RETURN;
    END IF;

    RAISE NOTICE 'Deleting user: %', target_user_id;

    -- Delete bookings first (to avoid FK constraint issues)
    DELETE FROM bookings 
    WHERE tutor_id = target_user_id
       OR student_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % bookings', deleted_count;

    -- Delete booking_messages (after bookings are gone)
    DELETE FROM booking_messages WHERE sender_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % booking_messages', deleted_count;

    -- Delete notifications
    DELETE FROM notifications WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % notifications', deleted_count;

    -- Delete ratings
    DELETE FROM ratings 
    WHERE student_id = target_user_id
       OR tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % ratings', deleted_count;

    -- Delete conversations
    DELETE FROM conversations 
    WHERE participant_1_id = target_user_id
       OR participant_2_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % conversations', deleted_count;

    -- Delete lesson_offers
    DELETE FROM lesson_offers 
    WHERE tutor_id = target_user_id
       OR student_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % lesson_offers', deleted_count;

    -- Delete sessions
    DELETE FROM sessions 
    WHERE tutor_id = target_user_id
       OR student_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % sessions', deleted_count;

    -- Delete payment-related records
    DELETE FROM commission_ledger WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % commission_ledger records', deleted_count;

    DELETE FROM tutor_balances WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_balances records', deleted_count;

    DELETE FROM tutor_earnings WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_earnings records', deleted_count;

    DELETE FROM payments WHERE payer_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % payments', deleted_count;

    -- Delete tutor-specific records
    DELETE FROM tutor_subjects WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_subjects', deleted_count;

    DELETE FROM tutor_video_provider_connections WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_video_provider_connections', deleted_count;

    DELETE FROM tutor_verified_subject_grades WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_verified_subject_grades', deleted_count;

    DELETE FROM tutor_verifications WHERE tutor_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % tutor_verifications', deleted_count;

    -- Delete parent-child relationships
    DELETE FROM parent_child_links 
    WHERE parent_id = target_user_id
       OR child_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % parent_child_links', deleted_count;

    -- Delete profile
    DELETE FROM profiles WHERE id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % profile', deleted_count;

    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % auth.users', deleted_count;

    RAISE NOTICE '✅ User deletion complete!';
END $$;
