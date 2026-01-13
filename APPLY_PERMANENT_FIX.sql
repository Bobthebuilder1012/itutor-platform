-- =====================================================
-- APPLY PERMANENT EMAIL CONFIRMATION FIX
-- =====================================================
-- Run this AFTER applying the two main migrations:
-- 1. FIX_TUTOR_SIGNUP_RLS.sql
-- 2. src/supabase/migrations/064_fix_trigger_use_metadata.sql
--
-- ⚠️ REPLACE 'YOUR_EMAIL_HERE' WITH YOUR ACTUAL EMAIL ⚠️
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Verify migrations are applied
-- =====================================================
DO $$
DECLARE
  trigger_count int;
  policy_count int;
BEGIN
  -- Check trigger
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger 
  WHERE tgname = 'on_auth_user_created';
  
  -- Check policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE tablename = 'profiles' 
    AND policyname IN ('profiles_insert_own_v6', 'profiles_service_role_insert_v6');
  
  IF trigger_count = 0 THEN
    RAISE EXCEPTION '❌ Trigger not found! Apply migration 064 first!';
  END IF;
  
  IF policy_count < 2 THEN
    RAISE EXCEPTION '❌ Policies not found! Apply FIX_TUTOR_SIGNUP_RLS.sql first!';
  END IF;
  
  RAISE NOTICE '✅ Migrations verified - proceeding with fix...';
END $$;

-- =====================================================
-- STEP 2: Check your account status
-- =====================================================
SELECT 
  '=== YOUR ACCOUNT STATUS ===' as info,
  u.id,
  u.email,
  u.email_confirmed_at,
  p.role,
  p.username,
  p.full_name,
  p.country,
  CASE 
    WHEN u.email_confirmed_at IS NULL THEN '❌ Email not confirmed'
    WHEN p.role IS NULL THEN '❌ Profile incomplete (missing role)'
    WHEN p.username IS NULL THEN '⚠️ Missing username'
    ELSE '✅ Account complete'
  END as diagnosis
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
ORDER BY u.created_at DESC
LIMIT 1;

-- =====================================================
-- STEP 3: Fix email confirmation
-- =====================================================
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
  AND email_confirmed_at IS NULL;

-- Show result
SELECT 
  CASE 
    WHEN email_confirmed_at IS NOT NULL 
    THEN '✅ Email is now confirmed!'
    ELSE '⚠️ Email was already confirmed or not found'
  END as email_status,
  email,
  email_confirmed_at
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE';  -- ⚠️ CHANGE THIS

-- =====================================================
-- STEP 4: Fix profile if incomplete
-- =====================================================

-- First, check if profile exists
DO $$
DECLARE
  profile_exists boolean;
  user_id uuid;
BEGIN
  -- Get user ID
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION '❌ User not found with that email!';
  END IF;
  
  -- Check if profile exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id
  ) INTO profile_exists;
  
  IF NOT profile_exists THEN
    -- Create profile if missing
    INSERT INTO public.profiles (
      id,
      email,
      role,
      full_name,
      created_at,
      updated_at
    )
    VALUES (
      user_id,
      'YOUR_EMAIL_HERE',  -- ⚠️ CHANGE THIS
      'tutor',  -- ⚠️ CHANGE THIS (tutor/student/parent)
      'Your Name',  -- ⚠️ CHANGE THIS
      NOW(),
      NOW()
    );
    RAISE NOTICE '✅ Profile created!';
  ELSE
    -- Update profile if incomplete
    UPDATE public.profiles
    SET 
      role = COALESCE(role, 'tutor'),  -- ⚠️ CHANGE THIS if needed
      username = COALESCE(username, 'tempuser' || substring(id::text from 1 for 8)),
      terms_accepted = true,
      terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
      updated_at = NOW()
    WHERE id = user_id
      AND (role IS NULL OR username IS NULL);
    
    RAISE NOTICE '✅ Profile updated!';
  END IF;
END $$;

-- =====================================================
-- STEP 5: Verify fix worked
-- =====================================================
SELECT 
  '=== FINAL STATUS ===' as info,
  u.email,
  CASE 
    WHEN u.email_confirmed_at IS NOT NULL THEN '✅ Confirmed'
    ELSE '❌ Not confirmed'
  END as email_status,
  CASE 
    WHEN p.role IS NOT NULL THEN '✅ Has role: ' || p.role
    ELSE '❌ No role'
  END as role_status,
  CASE 
    WHEN p.username IS NOT NULL THEN '✅ Has username: ' || p.username
    ELSE '❌ No username'
  END as username_status,
  CASE 
    WHEN u.email_confirmed_at IS NOT NULL 
         AND p.role IS NOT NULL 
         AND p.username IS NOT NULL
    THEN '🎉 READY TO LOGIN! Go to https://myitutor.com/login'
    ELSE '❌ Still has issues - check status above'
  END as final_diagnosis
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
ORDER BY u.created_at DESC
LIMIT 1;

COMMIT;

-- =====================================================
-- AFTER RUNNING THIS:
-- =====================================================
-- 1. Clear your browser cache OR use incognito mode
-- 2. Go to https://myitutor.com/login
-- 3. Enter your email and password
-- 4. Should log in successfully!
-- 
-- If still not working:
-- - Check the "final_diagnosis" output above
-- - Make sure you changed YOUR_EMAIL_HERE in all places
-- - Run DEBUG_EMAIL_CONFIRMATION.sql for more details
-- =====================================================


