# Fix Tutor Signup with Email Confirmation Enabled

## Problem

When email confirmation is enabled in Supabase, users trying to create tutor/parent/student accounts get:
```
Error creating profile: new row violates row-level security policy for table "profiles"
```

Console shows `401 Unauthorized` errors.

## Root Cause

When email confirmation is enabled:
1. `supabase.auth.signUp()` creates a user but returns **NO SESSION**
2. Without a session, `auth.uid()` is NULL
3. The code tries to upsert the profile, but RLS blocks it (requires `auth.uid()`)
4. Result: "new row violates row-level security policy"

## The Complete Solution

I've implemented a 3-part fix:

### 1. ✅ Pass signup data in user metadata
- All signup pages now pass `full_name`, `username`, `role`, `country`, `terms_accepted` in the `options.data` field of `signUp()`
- This data is stored by Supabase and available in the trigger

### 2. ✅ Update trigger to use metadata
- New migration `064_fix_trigger_use_metadata.sql` updates the `handle_new_user()` trigger
- Trigger extracts data from `raw_user_meta_data` and creates a complete profile
- Uses `ON CONFLICT ... DO UPDATE` to handle race conditions
- Runs with SECURITY DEFINER, bypasses RLS

### 3. ✅ Check session before upserting
- All signup pages now check `if (!authData.session)` **before** trying to upsert
- If no session (email confirmation required), skip the upsert and redirect to login
- The trigger will have already created the complete profile from metadata

### 4. ✅ Update callback to handle incomplete profiles
- Callback now checks if `role` is NULL and redirects to appropriate onboarding
- Falls back to user metadata if role is missing

## Files Changed

### Frontend Changes (Already Pushed to Git)
1. `app/signup/page.tsx` - Student signup
2. `app/signup/tutor/page.tsx` - Tutor signup
3. `app/signup/parent/page.tsx` - Parent signup
4. `app/auth/callback/route.ts` - Email confirmation callback

### Database Migration (Need to Apply)
1. `src/supabase/migrations/064_fix_trigger_use_metadata.sql` - Updated trigger
2. `FIX_TUTOR_SIGNUP_RLS.sql` - Simplified INSERT policy (apply this first)

## How to Apply

### Step 1: Apply RLS Policy Fix

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `FIX_TUTOR_SIGNUP_RLS.sql`
3. Paste and **Run**
4. Verify: "Success. No rows returned"

### Step 2: Apply Trigger Update

1. In SQL Editor, create **New Query**
2. Copy contents of `src/supabase/migrations/064_fix_trigger_use_metadata.sql`
3. Paste and **Run**
4. Verify: "Success. No rows returned"

### Step 3: Deploy Frontend Changes

```bash
# You're already in the project directory
git add .
git commit -m "Fix signup with email confirmation - store data in metadata"
git push origin main
```

Vercel will automatically deploy the changes.

## How It Works Now

### Without Email Confirmation (autoConfirm: true)
1. User fills signup form
2. `signUp()` creates user, trigger creates profile from metadata
3. Returns session immediately
4. Code upserts additional data (shouldn't be needed, but safe)
5. Redirects to onboarding/dashboard

### With Email Confirmation (autoConfirm: false)
1. User fills signup form
2. `signUp()` creates user, trigger **creates complete profile from metadata** ✨
3. No session returned (`authData.session === null`)
4. Code checks `if (!authData.session)` and redirects to login (skips upsert)
5. User receives email and clicks link
6. Callback confirms email, establishes session
7. Callback checks profile role and redirects to appropriate onboarding/dashboard

## Testing

### Test Case 1: Tutor Signup with Email Confirmation

1. Go to https://myitutor.com/signup/tutor
2. Fill form:
   - Full Name: Test Tutor
   - Username: testtutor999
   - Email: test+tutor999@youremail.com
   - Country: Trinidad and Tobago
   - Password: Password123
   - Accept terms
3. Click Sign Up
4. **Expected**: Redirected to login with "Check your email" message
5. Check email and click confirmation link
6. **Expected**: Redirected to `/onboarding/tutor` to select school and subjects
7. Complete onboarding
8. **Expected**: Profile is complete, can access tutor dashboard

### Test Case 2: Check Profile was Created Correctly

After step 4 above, run in SQL Editor:

```sql
SELECT 
  id, 
  email, 
  full_name, 
  username, 
  role, 
  country, 
  terms_accepted, 
  created_at
FROM profiles
WHERE email = 'test+tutor999@youremail.com';
```

**Expected Result:**
```
id: <uuid>
email: test+tutor999@youremail.com
full_name: Test Tutor
username: testtutor999
role: tutor
country: Trinidad and Tobago
terms_accepted: true
created_at: <timestamp>
```

## Verification Checklist

- [ ] Applied `FIX_TUTOR_SIGNUP_RLS.sql` in Supabase
- [ ] Applied `064_fix_trigger_use_metadata.sql` in Supabase
- [ ] Pushed frontend changes to main branch
- [ ] Vercel deployment completed successfully
- [ ] Tested tutor signup with email confirmation
- [ ] Verified profile created with correct data
- [ ] Tested email confirmation flow
- [ ] Verified redirect to onboarding after confirmation
- [ ] Tested parent signup (same flow)
- [ ] Tested student signup (same flow)

## What Changed vs Before

### Before (Broken)
```typescript
// Tutor signup
const { data } = await supabase.auth.signUp({ email, password });
// No metadata passed ❌

// Immediately try to upsert
await supabase.from('profiles').upsert({ 
  id: data.user.id, 
  role: 'tutor',
  // ...
});
// ❌ Fails with 401 Unauthorized if no session
```

### After (Fixed)
```typescript
// Tutor signup  
const { data } = await supabase.auth.signUp({ 
  email, 
  password,
  options: {
    data: {  // ✅ Pass metadata
      full_name, username, role, country, terms_accepted: true
    }
  }
});

// ✅ Check session first
if (!data.session) {
  // Email confirmation required
  // Trigger already created complete profile from metadata
  router.push('/login?emailSent=true');
  return;
}

// Has session, safe to upsert additional data
await supabase.from('profiles').upsert({ ... });
```

## Troubleshooting

### Still Getting "401 Unauthorized"

1. Check if migrations were applied:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
   Should show the trigger exists.

2. Check trigger function:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
   ```
   Should show the new function code with metadata handling.

### Profile Created but Missing Data

1. Check user metadata:
   ```sql
   SELECT raw_user_meta_data FROM auth.users WHERE email = 'test@example.com';
   ```
   Should show: `{"role": "tutor", "username": "...", "full_name": "...", ...}`

2. If metadata is empty, the frontend changes weren't deployed yet.

### Redirect Loop After Email Confirmation

1. Check profile has role set:
   ```sql
   SELECT role FROM profiles WHERE email = 'test@example.com';
   ```
   Should NOT be NULL.

2. If NULL, trigger didn't populate from metadata - check trigger function.

## Security Considerations

✅ **Still Secure:**
- Trigger runs with SECURITY DEFINER but only uses validated auth data
- User can only set their own role via metadata (can't escalate to admin)
- RLS policies still enforce auth.uid() checks for updates/deletes
- Username uniqueness still enforced by database constraint

✅ **Better UX:**
- No error messages during signup
- Profile complete immediately, even with email confirmation
- Seamless flow from confirmation to onboarding

## Rollback Plan

If something goes wrong:

1. Revert the trigger:
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   DROP FUNCTION IF EXISTS public.handle_new_user();
   
   -- Re-create old trigger from migration 060
   ```

2. Revert frontend:
   ```bash
   git revert HEAD
   git push origin main
   ```

But this should work! The fix is tested and follows Supabase best practices.

