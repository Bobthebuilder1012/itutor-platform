# Fix Tutor Signup Error - "Permission Denied for Table Users"

## Problem

When users try to create a tutor profile on the live site, they get the error:
```
Error creating profile: permission denied for table users
```

## Root Cause

The RLS policy created in migration 060 (`profiles_insert_own_or_new_user_v3`) contains a query to `auth.users`:

```sql
SELECT 1 FROM auth.users 
WHERE auth.users.id = profiles.id 
AND auth.users.created_at > (NOW() - INTERVAL '5 minutes')
```

Regular users don't have permission to query the `auth.users` table, causing the INSERT to fail.

## Solution

Apply the `FIX_TUTOR_SIGNUP_RLS.sql` migration which:
1. Removes the problematic policies that query `auth.users`
2. Creates simplified policies that only check `auth.uid()`
3. Relies on the trigger function (`handle_new_user`) to create basic profiles
4. Allows authenticated users to upsert their profiles during signup

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your iTutor project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `FIX_TUTOR_SIGNUP_RLS.sql`
6. Paste into the SQL editor
7. Click **Run** (or press Ctrl+Enter / Cmd+Enter)
8. You should see "Success. No rows returned"

### Option 2: Via Supabase CLI

```bash
# Make sure you're in the project directory
cd C:\Users\liamd\OneDrive\Documents\Pilot

# Run the migration
supabase db execute --file FIX_TUTOR_SIGNUP_RLS.sql
```

## Verify the Fix

After applying the migration:

1. Go to https://myitutor.com/signup/tutor
2. Try creating a new tutor account with a test email
3. Fill out the form and submit
4. You should **NOT** see the "Error creating profile: permission denied" message
5. You should be redirected to the onboarding page or email confirmation page

## What Changed

### Before
- INSERT policy tried to query `auth.users` to check if user was recently created
- This caused permission errors because regular users can't access `auth.users`

### After
- INSERT policy only checks if `id = auth.uid()` (no external table queries)
- Trigger function still runs to create basic profile (uses SECURITY DEFINER, bypasses RLS)
- Client-side upsert fills in the role, username, country, etc.

## Technical Details

The `handle_new_user()` trigger function uses `SECURITY DEFINER`, which means it runs with the privileges of the function owner (the database owner), bypassing RLS entirely. This is secure because:

1. The trigger only creates a minimal profile (id, email, full_name)
2. The trigger is automatically invoked by Supabase when a new auth user is created
3. The client-side code then updates the profile with role-specific data
4. The UPDATE policy checks `id = auth.uid()` to ensure users only modify their own profiles

## Alternative Solution (If This Doesn't Work)

If the above fix doesn't resolve the issue, you may need to check:

1. **Email confirmation settings**: If email confirmation is enabled in Supabase Auth settings, users won't have an authenticated session (`auth.uid()` will be NULL) until they confirm their email. In this case, the profile creation must happen entirely via the trigger.

2. **Trigger not firing**: Check if the `handle_new_user()` trigger is actually firing by checking the Supabase logs.

3. **Multiple signup flows**: Make sure all signup pages (student, tutor, parent) are using the same approach.

If you encounter any issues, please share:
- The exact error message
- Screenshots of the Supabase logs (Database > Logs)
- The Supabase Auth settings (Authentication > Settings > Email Auth)

