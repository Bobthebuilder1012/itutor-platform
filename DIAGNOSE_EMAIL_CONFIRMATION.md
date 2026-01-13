# Diagnose "Email Not Confirmed" Error

## Problem

You're getting an "email not confirmed" error when trying to log in, even though you clicked the confirmation link.

## Possible Causes

### 1. Email confirmation link hasn't been clicked yet
- Check your email inbox (and spam folder)
- Look for email from Supabase or iTutor
- Click the "Confirm your email" button

### 2. Confirmation link expired
- Links expire after 24 hours
- Solution: Resend confirmation email from login page

### 3. Confirmation succeeded but session not established
- The link worked but you need to log in manually
- Solution: Go to login page and enter email/password

### 4. Database issue - email_confirmed_at not set
- The confirmation might not have been recorded
- Solution: Check database (see below)

## Quick Fix - Check Database

Run this SQL query in Supabase Dashboard → SQL Editor:

```sql
-- Check your user's confirmation status
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  confirmed_at,
  (email_confirmed_at IS NOT NULL) as is_confirmed
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE'  -- Replace with your actual email
ORDER BY created_at DESC
LIMIT 1;
```

### Expected Results:

#### If email IS confirmed:
```
email_confirmed_at: 2026-01-11 20:30:45.123456+00  ✅
confirmed_at: 2026-01-11 20:30:45.123456+00  ✅
is_confirmed: true  ✅
```

#### If email is NOT confirmed:
```
email_confirmed_at: NULL  ❌
confirmed_at: NULL  ❌
is_confirmed: false  ❌
```

## Solution Based on Results

### Case 1: Email IS Confirmed (timestamps show)
If the database shows email is confirmed but you still get the error:

1. **Clear your browser cache and cookies**
   - Chrome: Ctrl+Shift+Delete → Clear browsing data
   - Or use incognito/private mode

2. **Try logging in again**
   - Go to https://myitutor.com/login
   - Enter your email and password
   - Should work now

3. **If still failing, manually confirm:**
   ```sql
   -- Run this in Supabase SQL Editor to force confirmation
   UPDATE auth.users
   SET email_confirmed_at = NOW(),
       confirmed_at = NOW()
   WHERE email = 'YOUR_EMAIL_HERE';
   ```

### Case 2: Email is NOT Confirmed (NULL timestamps)
If the database shows NULL, the confirmation never happened:

#### Option A: Resend Confirmation Email

1. Go to https://myitutor.com/login
2. You should see a message: "Please check your email to confirm your account"
3. Click **"Resend verification email"**
4. Check your email (including spam folder)
5. Click the confirmation link
6. Try logging in again

#### Option B: Manually Confirm in Database

If you can't receive emails (SMTP issues), force-confirm:

```sql
-- Run this in Supabase SQL Editor
UPDATE auth.users
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email = 'YOUR_EMAIL_HERE';
```

Then try logging in immediately.

## If Problem Persists

### Check Supabase Auth Settings

1. Go to Supabase Dashboard → Authentication → Settings
2. Check "Email Auth" section:
   - Is "Confirm email" toggle **ON**?
   - Is "Secure email change" **ON**?

### Temporarily Disable Email Confirmation (Testing Only)

If you need to test signup without email confirmation:

1. Go to Supabase Dashboard → Authentication → Settings → Email Auth
2. Find "Confirm email" toggle
3. Turn it **OFF**
4. Try signing up with a new email
5. Should immediately have access without email confirmation

⚠️ **Important:** Turn this back ON for production!

## Alternative Solution - Use the Email Confirmation Link

The confirmation link should look like:
```
https://myitutor.com/auth/callback?code=...&type=signup
```

### If you have the link:
1. Click it again (even if you already clicked it)
2. Should redirect you to dashboard or onboarding
3. If you see an error, check the URL parameters

### Common Link Errors:

#### Error: `?error=oauth_failed`
**Cause:** Code exchange failed
**Fix:** Resend confirmation email and use new link

#### Error: `?error=no_session`
**Cause:** Code was valid but no session created
**Fix:** 
```sql
-- Check if user exists
SELECT * FROM auth.users WHERE email = 'YOUR_EMAIL';

-- If exists, force confirm
UPDATE auth.users
SET email_confirmed_at = NOW(), confirmed_at = NOW()
WHERE email = 'YOUR_EMAIL';
```

#### Error: `?error=profile_creation_failed`
**Cause:** Profile couldn't be created
**Fix:** Apply the SQL migrations we created earlier:
- `FIX_TUTOR_SIGNUP_RLS.sql`
- `src/supabase/migrations/064_fix_trigger_use_metadata.sql`

## Debug Steps Summary

1. ✅ Check database: Is `email_confirmed_at` NULL or has timestamp?
2. ✅ If NULL: Resend email or manually confirm
3. ✅ If timestamp exists: Clear browser cache and try logging in
4. ✅ Still failing: Check Supabase Auth settings
5. ✅ Still failing: Apply SQL migrations (if not done yet)

## Need More Help?

Share the results of this SQL query:

```sql
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.confirmed_at,
  u.created_at,
  p.role,
  p.username,
  p.full_name,
  p.country
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'YOUR_EMAIL_HERE'
ORDER BY u.created_at DESC
LIMIT 1;
```

This will show both auth status and profile data.


