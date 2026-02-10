-- Simple deletion for ldhruvrampersad@gmail.com

DO $$
DECLARE
  user_id UUID;
BEGIN
  -- Get user ID
  SELECT id INTO user_id FROM auth.users WHERE email = 'ldhruvrampersad@gmail.com';
  
  IF user_id IS NULL THEN
    RAISE NOTICE 'User not found';
    RETURN;
  END IF;

  -- Delete from key tables (ignore errors)
  BEGIN DELETE FROM public.messages WHERE sender_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.conversations WHERE participant_1_id = user_id OR participant_2_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.notifications WHERE user_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.reviews WHERE reviewer_id = user_id OR reviewee_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.sessions WHERE tutor_id = user_id OR student_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.bookings WHERE tutor_id = user_id OR student_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.lesson_offers WHERE tutor_id = user_id OR student_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tutor_subjects WHERE tutor_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tutor_video_provider_connections WHERE tutor_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_subjects WHERE user_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.parent_child_links WHERE parent_id = user_id OR child_id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id = user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = user_id;
  
  RAISE NOTICE '✅ Deleted user';
END $$;
