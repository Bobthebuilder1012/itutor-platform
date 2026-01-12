-- =====================================================
-- FORCE CONFIRM EMAIL - Manual Email Confirmation
-- =====================================================
-- Use this if you clicked the confirmation link but still
-- getting "email not confirmed" error
--
-- ⚠️ REPLACE 'YOUR_EMAIL_HERE' WITH YOUR ACTUAL EMAIL ⚠️

BEGIN;

-- Step 1: Check current status
SELECT 
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  created_at,
  CASE 
    WHEN email_confirmed_at IS NOT NULL THEN '✅ Already confirmed'
    ELSE '❌ Not confirmed'
  END as status
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE';  -- ⚠️ CHANGE THIS

-- Step 2: Force confirm the email
UPDATE auth.users
SET 
  email_confirmed_at = NOW()
  -- Note: confirmed_at is auto-generated, don't set it manually
WHERE email = 'YOUR_EMAIL_HERE'  -- ⚠️ CHANGE THIS
  AND email_confirmed_at IS NULL;  -- Only update if not already confirmed

-- Step 3: Verify it worked
SELECT 
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  'Email is now confirmed! You can log in.' as message
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE';  -- ⚠️ CHANGE THIS

COMMIT;

-- =====================================================
-- After running this:
-- 1. Go to https://myitutor.com/login
-- 2. Enter your email and password
-- 3. Should work now!
-- =====================================================

