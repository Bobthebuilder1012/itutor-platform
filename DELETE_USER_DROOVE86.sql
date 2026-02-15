-- ============================================
-- DELETE USER: Droove86
-- ============================================
-- This script will delete the student user @Droove86
-- IMPORTANT: Review the verification queries before running the DELETE statements

-- ============================================
-- STEP 1: VERIFY USER EXISTS
-- ============================================
SELECT 
  id,
  full_name,
  username,
  email,
  role,
  created_at
FROM public.profiles
WHERE username = 'Droove86';

-- ============================================
-- STEP 2: CHECK RELATED DATA (Review before deleting)
-- ============================================

-- Check sessions associated with this user
SELECT 
  s.id as session_id,
  s.status,
  s.scheduled_start_at,
  t.full_name as tutor_name
FROM public.sessions s
JOIN public.profiles student ON s.student_id = student.id
LEFT JOIN public.profiles t ON s.tutor_id = t.id
WHERE student.username = 'Droove86';

-- Check bookings/booking requests
SELECT 
  b.id as booking_id,
  b.status,
  b.created_at,
  t.full_name as tutor_name
FROM public.bookings b
JOIN public.profiles student ON b.student_id = student.id
LEFT JOIN public.profiles t ON b.tutor_id = t.id
WHERE student.username = 'Droove86';

-- Check offers received
SELECT 
  o.id as offer_id,
  o.status,
  o.created_at,
  t.full_name as tutor_name
FROM public.offers o
JOIN public.profiles student ON o.student_id = student.id
LEFT JOIN public.profiles t ON t.id = o.tutor_id
WHERE student.username = 'Droove86';

-- Check ratings/reviews given by this student
SELECT 
  r.id as rating_id,
  r.stars,
  r.comment,
  r.created_at,
  t.full_name as tutor_name
FROM public.ratings r
JOIN public.profiles student ON r.student_id = student.id
LEFT JOIN public.profiles t ON t.id = r.tutor_id
WHERE student.username = 'Droove86';

-- ============================================
-- STEP 3: DELETE RELATED DATA
-- ============================================
-- Run these statements AFTER reviewing the verification queries above

-- Get the user ID for use in DELETE statements
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE username = 'Droove86';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User Droove86 not found!';
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting user with ID: %', v_user_id;

  -- Delete ratings given by the student
  DELETE FROM public.ratings
  WHERE student_id = v_user_id;
  RAISE NOTICE 'Deleted ratings';

  -- Delete offers sent to the student
  DELETE FROM public.offers
  WHERE student_id = v_user_id;
  RAISE NOTICE 'Deleted offers';

  -- Delete sessions (student sessions)
  DELETE FROM public.sessions
  WHERE student_id = v_user_id;
  RAISE NOTICE 'Deleted sessions';

  -- Delete bookings/booking requests
  DELETE FROM public.bookings
  WHERE student_id = v_user_id;
  RAISE NOTICE 'Deleted bookings';

  -- Delete from auth.users (this will cascade to profiles if FK is set up correctly)
  -- NOTE: This requires appropriate permissions
  DELETE FROM auth.users
  WHERE id = v_user_id;
  RAISE NOTICE 'Deleted from auth.users';

  -- Delete profile (if not already deleted by cascade)
  DELETE FROM public.profiles
  WHERE id = v_user_id;
  RAISE NOTICE 'Deleted profile';

  RAISE NOTICE 'User Droove86 has been completely deleted!';
END $$;

-- ============================================
-- ALTERNATIVE: Manual DELETE statements if block doesn't work
-- ============================================
-- Uncomment and use these if the DO block above doesn't work

/*
-- First, get the user ID
-- SELECT id FROM public.profiles WHERE username = 'Droove86';
-- Replace 'USER_ID_HERE' with the actual UUID from the query above

-- Delete ratings
DELETE FROM public.ratings
WHERE student_id = 'USER_ID_HERE';

-- Delete offers
DELETE FROM public.offers
WHERE student_id = 'USER_ID_HERE';

-- Delete sessions
DELETE FROM public.sessions
WHERE student_id = 'USER_ID_HERE';

-- Delete bookings
DELETE FROM public.bookings
WHERE student_id = 'USER_ID_HERE';

-- Delete from auth.users (requires admin permissions)
DELETE FROM auth.users
WHERE id = 'USER_ID_HERE';

-- Delete profile (if not already deleted by cascade)
DELETE FROM public.profiles
WHERE id = 'USER_ID_HERE';
*/

-- ============================================
-- STEP 4: VERIFY DELETION
-- ============================================
-- Run this to confirm the user is deleted
SELECT 
  id,
  full_name,
  username,
  email,
  role
FROM public.profiles
WHERE username = 'Droove86';
-- Should return 0 rows if deletion was successful
