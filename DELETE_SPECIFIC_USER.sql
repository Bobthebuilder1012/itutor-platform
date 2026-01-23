-- =====================================================
-- DELETE SPECIFIC USER (Alejandro Lee)
-- =====================================================
-- Safely delete a single user and all associated data
-- Handles foreign key constraints in correct order

DO $$
DECLARE
  user_id uuid := '4ba237f3-bcef-4bb3-a59f-494ce8ef9210'; -- Alejandro Lee's ID
BEGIN
  RAISE NOTICE '🗑️ Starting deletion for user ID: %', user_id;

  -- Step 1: Delete booking messages (the constraint that's blocking)
  DELETE FROM public.booking_messages 
  WHERE sender_id = user_id;
  RAISE NOTICE '✅ Deleted booking_messages';

  -- Step 2: Delete notifications
  DELETE FROM public.notifications WHERE user_id = user_id;
  RAISE NOTICE '✅ Deleted notifications';

  -- Step 3: Delete ratings
  DELETE FROM public.ratings 
  WHERE student_id = user_id OR tutor_id = user_id;
  RAISE NOTICE '✅ Deleted ratings';

  -- Step 4: Delete conversations
  DELETE FROM public.conversations 
  WHERE participant_1_id = user_id OR participant_2_id = user_id;
  RAISE NOTICE '✅ Deleted conversations';

  -- Step 5: Delete lesson offers
  DELETE FROM public.lesson_offers 
  WHERE student_id = user_id OR tutor_id = user_id;
  RAISE NOTICE '✅ Deleted lesson_offers';

  -- Step 6: Delete sessions
  DELETE FROM public.sessions 
  WHERE student_id = user_id OR tutor_id = user_id;
  RAISE NOTICE '✅ Deleted sessions';

  -- Step 7: Delete bookings
  DELETE FROM public.bookings 
  WHERE student_id = user_id OR tutor_id = user_id;
  RAISE NOTICE '✅ Deleted bookings';

  -- Step 8: Delete tutor-specific records
  DELETE FROM public.tutor_subjects WHERE tutor_id = user_id;
  DELETE FROM public.tutor_video_provider_connections WHERE tutor_id = user_id;
  RAISE NOTICE '✅ Deleted tutor-specific records';

  -- Step 9: Delete payment records
  DELETE FROM public.commission_ledger WHERE tutor_id = user_id;
  DELETE FROM public.tutor_balances WHERE tutor_id = user_id;
  DELETE FROM public.tutor_earnings WHERE tutor_id = user_id;
  DELETE FROM public.payments 
  WHERE student_id = user_id OR payer_id = user_id OR tutor_id = user_id;
  RAISE NOTICE '✅ Deleted payment records';

  -- Step 10: Delete parent-child relationships
  DELETE FROM public.parent_child_links
  WHERE parent_id = user_id OR child_id = user_id;
  RAISE NOTICE '✅ Deleted parent_child_links';

  -- Step 11: Delete verification records
  DELETE FROM public.tutor_verified_subject_grades WHERE tutor_id = user_id;
  DELETE FROM public.tutor_verifications WHERE tutor_id = user_id;
  RAISE NOTICE '✅ Deleted verification records';

  -- Step 12: Delete profile
  DELETE FROM public.profiles WHERE id = user_id;
  RAISE NOTICE '✅ Deleted profile';

  -- Step 13: Delete from auth.users (if you have permission)
  DELETE FROM auth.users WHERE id = user_id;
  RAISE NOTICE '✅ Deleted auth.users';

  RAISE NOTICE '🎉 Successfully deleted user: %', user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Error during deletion: %', SQLERRM;
    RAISE EXCEPTION 'Deletion failed: %', SQLERRM;
END $$;
