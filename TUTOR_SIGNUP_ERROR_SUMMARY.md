# Tutor Signup Error - Complete Analysis & Fix

## Error Reported

Users trying to create tutor profiles on the live site (myitutor.com) are getting:
```
Error creating profile: permission denied for table users
```

## Root Cause Analysis

### The Problem

In migration file `src/supabase/migrations/060_fix_profile_insert_for_triggers.sql`, the INSERT policy for the `profiles` table contains this check:

```sql
CREATE POLICY "profiles_insert_own_or_new_user_v3"
ON public.profiles FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = profiles.id 
    AND auth.users.created_at > (NOW() - INTERVAL '5 minutes')
  )
);
```

The problem is on lines 72-74 where it queries `auth.users`. **Regular users don't have permission to query the `auth.users` table**, causing the INSERT to fail with "permission denied for table users".

### Why This Happens

1. User fills out the tutor signup form
2. Code calls `supabase.auth.signUp(email, password)`
3. Supabase creates the auth user and returns a session
4. Code immediately tries to upsert the profile (add role, username, etc.)
5. The INSERT policy is evaluated and tries to query `auth.users`
6. **BOOM** - Permission denied because regular users can't access `auth.users`

### Affects All Signup Flows

This issue affects:
- ✅ Student signup (`app/signup/page.tsx`)
- ✅ Tutor signup (`app/signup/tutor/page.tsx`)
- ✅ Parent signup (`app/signup/parent/page.tsx`)

All three use the same upsert pattern after `signUp()`.

## The Solution

### Quick Fix (Apply Immediately)

Run the SQL migration in `FIX_TUTOR_SIGNUP_RLS.sql` which:

1. **Removes the problematic policy** that queries `auth.users`
2. **Creates a simplified policy** that only checks `auth.uid()`
3. **Maintains security** - users can only insert their own profile

### How the Fixed Flow Works

After applying the fix:

1. User submits signup form
2. `supabase.auth.signUp()` creates auth user and returns session with `auth.uid()` set
3. Trigger `handle_new_user()` automatically creates a minimal profile (id, email, full_name)
   - Uses SECURITY DEFINER, bypasses RLS ✅
4. Client-side code upserts profile to add role, username, country, etc.
   - Now works because `auth.uid()` is set and policy only checks `id = auth.uid()` ✅
5. User is redirected to onboarding or email confirmation page

## How to Apply the Fix

### Step 1: Copy the SQL

Open `FIX_TUTOR_SIGNUP_RLS.sql` and copy all the contents.

### Step 2: Run in Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your iTutor project (nfkrfciozjxrodkusrhh)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Paste the SQL from `FIX_TUTOR_SIGNUP_RLS.sql`
6. Click **Run** (or Ctrl+Enter)
7. Verify you see "Success. No rows returned"

### Step 3: Test the Fix

1. Go to https://myitutor.com/signup/tutor
2. Use a **new test email** (e.g., test+12345@example.com)
3. Fill out the form:
   - Full name: Test Tutor
   - Username: testtutor12345
   - Email: test+12345@example.com
   - Country: Trinidad and Tobago
   - Password: TestPassword123
4. Accept terms and submit
5. **Expected result**: 
   - No "permission denied" error
   - Redirected to onboarding page or email confirmation
   - Profile created successfully

## What Changed

### Before (Broken)

```sql
-- Bad: Queries auth.users which users can't access
CREATE POLICY "profiles_insert_own_or_new_user_v3"
ON public.profiles FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM auth.users  -- ❌ Permission denied!
    WHERE auth.users.id = profiles.id 
  )
);
```

### After (Fixed)

```sql
-- Good: Only checks auth.uid() which is always available
CREATE POLICY "profiles_insert_own_v6"
ON public.profiles FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND id = auth.uid()  -- ✅ Works!
);
```

## Technical Details

### Why the Trigger Alone Wasn't Enough

The `handle_new_user()` trigger creates a basic profile, but the client-side code needs to update it with:
- `role` (student/tutor/parent)
- `username`
- `country`
- `terms_accepted`
- `terms_accepted_at`

The upsert operation needs to succeed for the signup to complete.

### Why Email Confirmation Doesn't Break This

Even when email confirmation is enabled:
1. `supabase.auth.signUp()` still returns a session immediately
2. `auth.uid()` is set in that session
3. The user can perform authenticated operations (like upserting their profile)
4. They just can't log in *again* until they confirm their email

So the fix works regardless of email confirmation settings.

### Security Considerations

The new policy is still secure:
- Only checks `id = auth.uid()` - users can only insert profiles with their own ID
- The trigger runs as SECURITY DEFINER but only inserts minimal data
- Service role can still insert (for admin operations)
- No security regression compared to previous migrations

## If Problems Persist

If you still see errors after applying the fix, check:

### 1. Supabase Auth Settings

Go to Authentication > Settings > Email Auth and verify:
- "Enable email confirmations" setting
- "Confirm email" toggle state

### 2. Check Supabase Logs

Go to Database > Logs and look for:
- RLS policy violations
- Trigger execution errors
- Foreign key constraint violations

### 3. Verify Trigger Exists

Run this in the SQL Editor:

```sql
SELECT * FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';
```

Should return one row showing the trigger on `auth.users`.

### 4. Check Current Policies

Run this in the SQL Editor:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
```

You should see `profiles_insert_own_v6` in the list.

## Files Created

- ✅ `FIX_TUTOR_SIGNUP_RLS.sql` - The SQL migration to apply
- ✅ `FIX_TUTOR_SIGNUP_INSTRUCTIONS.md` - Detailed instructions
- ✅ `TUTOR_SIGNUP_ERROR_SUMMARY.md` - This comprehensive analysis

## Next Steps

1. **Apply the fix immediately** using the SQL Editor
2. **Test with a new account** to verify it works
3. **Monitor Supabase logs** for any new errors
4. **Notify affected users** that signup is working again

If successful, you should see new tutor accounts being created without errors!

