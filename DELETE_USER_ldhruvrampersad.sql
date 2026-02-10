-- Delete user ldhruvrampersad@gmail.com and all associated data
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get the user ID from the email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'ldhruvrampersad@gmail.com';

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User with email ldhruvrampersad@gmail.com not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Found user ID: %', target_user_id;

  -- Delete in order of foreign key dependencies

  -- 1. Delete messages (has FK to conversations)
  DELETE FROM public.messages WHERE sender_id = target_user_id;
  DELETE FROM public.messages WHERE conversation_id IN (
    SELECT id FROM public.conversations 
    WHERE participant_1_id = target_user_id OR participant_2_id = target_user_id
  );
  RAISE NOTICE 'Deleted messages';

  -- 2. Delete conversations
  DELETE FROM public.conversations 
  WHERE participant_1_id = target_user_id OR participant_2_id = target_user_id;
  RAISE NOTICE 'Deleted conversations';

  -- 3. Delete notifications (both sent and received)
  DELETE FROM public.notifications WHERE user_id = target_user_id;
  DELETE FROM public.notifications WHERE triggered_by_user_id = target_user_id;
  RAISE NOTICE 'Deleted notifications';

  -- 4. Delete reviews (as reviewer or reviewee)
  DELETE FROM public.reviews WHERE reviewer_id = target_user_id;
  DELETE FROM public.reviews WHERE reviewee_id = target_user_id;
  RAISE NOTICE 'Deleted reviews';

  -- 5. Delete sessions (as tutor or student)
  DELETE FROM public.sessions WHERE tutor_id = target_user_id;
  DELETE FROM public.sessions WHERE student_id = target_user_id;
  RAISE NOTICE 'Deleted sessions';

  -- 6. Delete booking-related data
  DELETE FROM public.booking_messages WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE tutor_id = target_user_id OR student_id = target_user_id
  );
  DELETE FROM public.bookings WHERE tutor_id = target_user_id OR student_id = target_user_id;
  RAISE NOTICE 'Deleted bookings';

  -- 7. Delete lesson offers
  DELETE FROM public.lesson_offers WHERE tutor_id = target_user_id;
  DELETE FROM public.lesson_offers WHERE student_id = target_user_id;
  RAISE NOTICE 'Deleted lesson offers';

  -- 8. Delete tutor-specific data
  DELETE FROM public.tutor_subjects WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_video_provider_connections WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_verifications WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_verified_subject_grades WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_availability WHERE tutor_id = target_user_id;
  RAISE NOTICE 'Deleted tutor data';

  -- 9. Delete student-specific data
  DELETE FROM public.user_subjects WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted student subjects';

  -- 10. Delete parent-child relationships
  DELETE FROM public.parent_child_links WHERE parent_id = target_user_id;
  DELETE FROM public.parent_child_links WHERE child_id = target_user_id;
  RAISE NOTICE 'Deleted parent-child links';

  -- 11. Delete payment-related data (in correct order)
  DELETE FROM public.commission_ledger WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_balances WHERE tutor_id = target_user_id;
  DELETE FROM public.tutor_earnings WHERE tutor_id = target_user_id;
  DELETE FROM public.payments WHERE payer_id = target_user_id;
  DELETE FROM public.payments WHERE recipient_id = target_user_id;
  RAISE NOTICE 'Deleted payment data';

  -- 12. Delete support requests
  DELETE FROM public.support_requests WHERE email = 'ldhruvrampersad@gmail.com';
  RAISE NOTICE 'Deleted support requests';

  -- 13. Delete profile
  DELETE FROM public.profiles WHERE id = target_user_id;
  RAISE NOTICE 'Deleted profile';

  -- 14. Delete from auth.users (final step)
  DELETE FROM auth.users WHERE id = target_user_id;
  RAISE NOTICE 'Deleted auth user';

  RAISE NOTICE '✅ Successfully deleted user ldhruvrampersad@gmail.com and all associated data';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Deletion failed: %', SQLERRM;
    RAISE;
END $$;
