# Apply Migration 060 - Fix Profile Creation RLS

## Problem Identified
The RLS policies from migration 059 were blocking profile creation during signup, causing the error:
**"Error creating profile: new row violates row-level security policy for table 'profiles'"**

## Root Cause
1. The `handle_new_user()` trigger was blocked by RLS policies
2. The client-side profile insert during signup was blocked (no session before email confirmation)
3. The INSERT policy was too restrictive: only allowed `id = auth.uid()`, which fails when no session exists

## Solution
Migration 060 fixes this by:
1. Recreating the trigger to insert minimal profile data
2. Creating a smarter INSERT policy that allows new users (created within 5 minutes) to have profiles inserted
3. Maintaining security while allowing the signup flow to work

## How to Apply

### Option A: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `src/supabase/migrations/060_fix_profile_insert_for_triggers.sql`
6. Paste into the SQL editor
7. Click **Run** (or press Ctrl+Enter / Cmd+Enter)
8. Verify you see "Success. No rows returned"

### Option B: Via Supabase CLI

```bash
# Make sure you're logged in
supabase login

# Link to your project (if not already linked)
supabase link --project-ref nfkrfciozjxrodkusrhh

# Push the migration
supabase db push
```

## Verify the Fix

After applying the migration:

1. Go to your live site (myitutor.com)
2. Try signing up with a NEW email
3. Fill out the form and submit
4. You should NO LONGER see the "Error creating profile" message
5. After email confirmation, complete the onboarding (school, subjects)
6. You should be redirected to the student dashboard successfully

## What Changed

### Trigger Function
- Now only inserts `id`, `email`, `full_name`, `created_at`, `updated_at`
- `role` and `username` are set to NULL and filled by the signup flow

### INSERT Policy
**Before (blocked everything):**
```sql
WITH CHECK (id = auth.uid())  -- Failed when no session exists
```

**After (allows new signups):**
```sql
WITH CHECK (
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = profiles.id 
    AND auth.users.created_at > (NOW() - INTERVAL '5 minutes')
  )
)
```

This allows profile creation for users who just signed up (within 5 minutes), even without a session.




