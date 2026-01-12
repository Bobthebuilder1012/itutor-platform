-- =====================================================
-- DEBUG EMAIL CONFIRMATION STATUS
-- =====================================================
-- Run this to see exactly what's going on with your account
--
-- ⚠️ REPLACE 'YOUR_EMAIL_HERE' WITH YOUR ACTUAL EMAIL ⚠️

-- Check 1: See ALL users with your email (might be duplicates)
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at,
  CASE 
    WHEN email_confirmed_at IS NOT NULL THEN '✅ Confirmed'
    ELSE '❌ Not Confirmed'
  END as confirmation_status,
  CASE 
    WHEN deleted_at IS NOT NULL THEN '⚠️ Deleted'
    ELSE '✅ Active'
  END as account_status
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
ORDER BY created_at DESC;

-- Check 2: See the profile associated with this email
SELECT 
  p.id,
  p.email,
  p.role,
  p.username,
  p.full_name,
  p.country,
  p.created_at,
  u.email_confirmed_at as auth_email_confirmed
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE p.email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
ORDER BY p.created_at DESC;

-- Check 3: Count how many users have this email
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN email_confirmed_at IS NOT NULL THEN 1 END) as confirmed_users,
  COUNT(CASE WHEN email_confirmed_at IS NULL THEN 1 END) as unconfirmed_users
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE';  -- ⚠️ CHANGE THIS

-- =====================================================
-- INTERPRET THE RESULTS:
-- =====================================================
-- If you see multiple users with same email:
--   → You signed up multiple times, need to confirm the LATEST one
--
-- If email_confirmed_at is still NULL:
--   → The UPDATE didn't work, try the force update below
--
-- If email_confirmed_at has a timestamp but still can't login:
--   → Supabase Auth settings issue (see solution below)
-- =====================================================

