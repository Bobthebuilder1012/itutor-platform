# System-Wide Email Confirmation Fix

## Problem

Email confirmation system is broken for ALL users:
- Signup fails with "permission denied for table users"
- Or signup succeeds but login fails with "email not confirmed"
- Profiles aren't created properly when email confirmation is enabled

## System-Wide Solution (2 Migrations)

These two migrations fix the system for ALL future and existing users:

### Migration 1: Fix RLS Policy
**File:** `FIX_TUTOR_SIGNUP_RLS.sql`

**What it fixes:**
- Removes the broken INSERT policy that queries `auth.users` table
- Creates a simple policy that only checks `auth.uid()`
- Allows the trigger to bypass RLS with SECURITY DEFINER

**Apply:**
1. Open Supabase Dashboard → SQL Editor
2. Copy ALL contents of `FIX_TUTOR_SIGNUP_RLS.sql`
3. Paste and Run
4. Verify: "Success. No rows returned"

### Migration 2: Update Trigger Function
**File:** `src/supabase/migrations/064_fix_trigger_use_metadata.sql`

**What it fixes:**
- Updates `handle_new_user()` trigger to extract signup data from user metadata
- Creates complete profiles immediately on signup (even without session)
- Uses `ON CONFLICT DO UPDATE` to handle race conditions
- Works perfectly with email confirmation enabled

**Apply:**
1. In SQL Editor, click New Query
2. Copy ALL contents of `064_fix_trigger_use_metadata.sql`
3. Paste and Run
4. Verify: "Success. No rows returned"

## How It Works After Fix

### Before (Broken) ❌
```
User signs up
  → auth.signUp() creates user
  → No session (email confirmation required)
  → Code tries to upsert profile
  → auth.uid() is NULL
  → RLS blocks INSERT
  → Error: "permission denied" or "RLS policy violation"
```

### After (Fixed) ✅
```
User signs up
  → auth.signUp() with metadata (role, username, etc.)
  → Trigger fires with SECURITY DEFINER
  → Trigger creates complete profile from metadata
  → Profile has: role, username, country, terms_accepted
  → No session yet (email confirmation required)
  → Code checks: if (!authData.session) redirect to email page
  → User confirms email
  → User can log in successfully
```

## Verify Migrations Applied

Run this to confirm both migrations are active:

```sql
-- Check 1: Verify trigger function uses metadata
SELECT 
  p.proname as function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%raw_user_meta_data%' 
    THEN '✅ Uses metadata - GOOD'
    ELSE '❌ Old version - migration not applied'
  END as status
FROM pg_proc p
WHERE p.proname = 'handle_new_user';

-- Check 2: Verify new policies exist
SELECT 
  policyname,
  CASE 
    WHEN policyname IN ('profiles_insert_own_v6', 'profiles_service_role_insert_v6')
    THEN '✅ New policy - GOOD'
    ELSE '⚠️ Old policy - may cause issues'
  END as status
FROM pg_policies
WHERE tablename = 'profiles'
  AND cmd = 'INSERT'
ORDER BY policyname;

-- Check 3: Verify trigger is attached
SELECT 
  tgname as trigger_name,
  '✅ Trigger exists' as status
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
```

**Expected output:**
- Function uses metadata: ✅
- Policies v6 exist: ✅
- Trigger exists: ✅

## Test With New Signup

The best way to verify the system-wide fix:

### Test 1: New Tutor Signup
1. Go to https://myitutor.com/signup/tutor
2. Use a NEW test email (test+123@example.com)
3. Fill form completely:
   - Full name
   - Username
   - Email
   - Country
   - Password
   - Accept terms
4. Submit

**Expected behavior:**
- ✅ No errors during signup
- ✅ Redirects to "Check your email" page
- ✅ Profile created in database immediately

### Test 2: Check Profile Was Created
```sql
-- Check that profile was created with complete data
SELECT 
  u.email,
  u.email_confirmed_at,
  p.role,
  p.username,
  p.full_name,
  p.country,
  p.terms_accepted,
  CASE 
    WHEN p.role IS NOT NULL AND p.username IS NOT NULL 
    THEN '✅ Profile complete'
    ELSE '❌ Profile incomplete - migration not working'
  END as profile_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'test+123@example.com'  -- Your test email
ORDER BY u.created_at DESC
LIMIT 1;
```

**Expected result:**
- email: test+123@example.com
- email_confirmed_at: NULL (not confirmed yet)
- role: tutor ✅
- username: testuser123 ✅
- full_name: Test User ✅
- country: Trinidad and Tobago ✅
- terms_accepted: true ✅
- profile_status: ✅ Profile complete

### Test 3: Email Confirmation
1. Check email inbox
2. Click "Confirm your email" link
3. Should redirect to `/onboarding/tutor`
4. Complete onboarding (school, subjects)
5. Should redirect to tutor dashboard
6. Can use platform normally

### Test 4: Login After Confirmation
1. Go to https://myitutor.com/login
2. Enter the test email and password
3. Should log in successfully ✅

## What About Existing Broken Accounts?

The migrations fix the **system** for new signups. Existing broken accounts need individual fixes:

### Option A: Delete and Recreate (Recommended)
```sql
-- Delete broken account
DELETE FROM public.profiles WHERE email = 'broken@email.com';
DELETE FROM auth.users WHERE email = 'broken@email.com';

-- User signs up again - will work properly now with fixed system
```

### Option B: Manually Fix Existing Account
```sql
-- Confirm email
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email = 'broken@email.com';

-- Complete profile
UPDATE public.profiles 
SET 
  role = 'tutor',  -- or student/parent
  username = 'username123',
  terms_accepted = true,
  terms_accepted_at = NOW(),
  updated_at = NOW()
WHERE email = 'broken@email.com';
```

## Frontend Changes (Already Pushed)

The frontend code changes were already pushed to GitHub in commit `3d7cd58`:
- ✅ Signup pages pass data in metadata
- ✅ Signup pages check session before upserting
- ✅ Callback handles incomplete profiles
- ✅ Works with email confirmation enabled

These are already deployed on Vercel.

## Supabase Settings (For Production)

After migrations are applied, configure Supabase:

### Email Auth Settings
1. Dashboard → Authentication → Settings → Email Auth
2. **"Confirm email"**: ON ✅
3. **"Secure email change"**: ON ✅

### SMTP Settings (Important!)
1. Dashboard → Authentication → Settings → SMTP
2. **Enable custom SMTP**
3. Use SendGrid or similar:
   - Host: smtp.sendgrid.net
   - Port: 587
   - Sender: noreply@myitutor.com
   - Without SMTP: Only 4 emails/hour limit

### Email Templates
1. Dashboard → Authentication → Email Templates
2. Upload `email-templates/confirm-signup.html`
3. Subject: "Confirm your iTutor account"

## Final Checklist

- [ ] Applied `FIX_TUTOR_SIGNUP_RLS.sql` in Supabase SQL Editor
- [ ] Applied `064_fix_trigger_use_metadata.sql` in Supabase SQL Editor
- [ ] Ran verification query - all checks pass ✅
- [ ] Tested new signup with test email
- [ ] Verified profile created with complete data
- [ ] Tested email confirmation flow
- [ ] Tested login after confirmation
- [ ] Email confirmation is ON in Supabase settings
- [ ] Custom SMTP configured (for production)
- [ ] Email templates uploaded

## Success Criteria

After applying both migrations, the system should:
- ✅ Allow any user to sign up (student/tutor/parent)
- ✅ Create complete profiles immediately (even without session)
- ✅ Work with email confirmation enabled
- ✅ Allow login after email confirmation
- ✅ Never show "permission denied" errors
- ✅ Never show "RLS policy violation" errors
- ✅ Never require manual database fixes for new users

## If Verification Fails

If the verification query shows issues:

**Trigger not using metadata?**
- Migration 064 not applied or failed
- Re-run `064_fix_trigger_use_metadata.sql`

**Old policies still exist?**
- Migration 1 not applied or failed
- Re-run `FIX_TUTOR_SIGNUP_RLS.sql`

**Trigger doesn't exist?**
- Both migrations need to be applied
- Apply in order: FIX_TUTOR_SIGNUP_RLS.sql first, then 064

## Support

After applying migrations, any new user signup should work perfectly. If issues persist, check:
1. Verification query output
2. Supabase logs (Dashboard → Logs)
3. Browser console errors
4. Frontend is deployed (Vercel)

