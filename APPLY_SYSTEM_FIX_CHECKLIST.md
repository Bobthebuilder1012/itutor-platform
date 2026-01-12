# Apply System-Wide Fix - Simple Checklist

## What This Fixes

Email confirmation system for **ALL users** - both new signups and future users.

## Apply 2 Migrations (That's It!)

### ✅ Step 1: Fix RLS Policy

1. Open [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard)
2. Open file: `FIX_TUTOR_SIGNUP_RLS.sql`
3. Copy ENTIRE contents
4. Paste in SQL Editor
5. Click **Run**
6. See: "Success. No rows returned" ✅

**What this does:** Fixes the INSERT policy that was blocking profile creation

---

### ✅ Step 2: Fix Trigger Function

1. In SQL Editor, click **New Query**
2. Open file: `src/supabase/migrations/064_fix_trigger_use_metadata.sql`
3. Copy ENTIRE contents
4. Paste in SQL Editor
5. Click **Run**
6. See: "Success. No rows returned" ✅

**What this does:** Updates trigger to create complete profiles from signup metadata

---

### ✅ Step 3: Verify It Worked

Run this in SQL Editor:

```sql
-- Verification Query
SELECT 
  'Trigger Check' as test,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%raw_user_meta_data%' 
    THEN '✅ PASS - Uses metadata'
    ELSE '❌ FAIL - Migration 064 not applied'
  END as result
FROM pg_proc p
WHERE p.proname = 'handle_new_user'

UNION ALL

SELECT 
  'Policy Check' as test,
  CASE 
    WHEN COUNT(*) = 2 THEN '✅ PASS - New policies exist'
    ELSE '❌ FAIL - FIX_TUTOR_SIGNUP_RLS not applied'
  END as result
FROM pg_policies
WHERE tablename = 'profiles'
  AND policyname IN ('profiles_insert_own_v6', 'profiles_service_role_insert_v6')

UNION ALL

SELECT 
  'Trigger Exists' as test,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ PASS - Trigger attached'
    ELSE '❌ FAIL - Trigger missing'
  END as result
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
```

**Expected Output:**
```
✅ PASS - Uses metadata
✅ PASS - New policies exist
✅ PASS - Trigger attached
```

If all 3 show ✅ PASS, **the system is fixed!**

---

### ✅ Step 4: Test With New Signup

1. Go to https://myitutor.com/signup/tutor
2. Sign up with a NEW test email
3. Should redirect to "Check your email" (no errors)
4. Check database:

```sql
SELECT 
  u.email,
  p.role,
  p.username,
  p.full_name,
  CASE 
    WHEN p.role IS NOT NULL THEN '✅ System working!'
    ELSE '❌ System still broken'
  END as system_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'your-test-email@example.com'
ORDER BY u.created_at DESC
LIMIT 1;
```

Profile should have role, username, and full_name immediately ✅

---

## Done!

After these 4 steps, the email confirmation system works for ALL users:
- ✅ New signups work
- ✅ Profiles created complete
- ✅ Email confirmation works
- ✅ Login works after confirmation
- ✅ No more manual database fixes needed

## What About My Broken Account?

Your account was created before the fix. Two options:

**Option A: Start fresh (easiest)**
```sql
DELETE FROM public.profiles WHERE email = 'your@email.com';
DELETE FROM auth.users WHERE email = 'your@email.com';
-- Then sign up again - will work properly now
```

**Option B: Manual fix**
```sql
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'your@email.com';
UPDATE public.profiles SET role = 'tutor', username = 'yourname', terms_accepted = true WHERE email = 'your@email.com';
-- Then try logging in
```

Choose whichever you prefer!

