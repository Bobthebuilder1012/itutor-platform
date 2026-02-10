# Welcome Email Issue - Root Cause & Fix

## 🔴 Problem Identified

New users aren't receiving welcome emails because the signup pages bypass the email queue system.

### Current (Broken) Flow:
```
User signs up 
  → supabase.auth.signUp() (direct client call)
  → User created in database
  → ❌ NO emails queued
  → ❌ User never gets welcome emails
```

### Expected (Working) Flow:
```
User signs up
  → Call /api/auth/signup-with-emails
  → User created in database
  → ✅ Emails queued in onboarding_email_queue table
  → ✅ Cron job sends emails every 15 minutes
```

## 🔍 Technical Details

### The Email System (Already Built):
1. ✅ **Queue System**: `lib/services/onboardingEmailQueue.ts` - Queues emails with delays
2. ✅ **Cron Job**: `/api/cron/send-onboarding-emails` - Runs every 15 minutes
3. ✅ **Vercel Config**: `vercel.json` - Cron job is configured
4. ✅ **API Route**: `/api/auth/signup-with-emails` - Handles signup + queueing

### The Problem:
The signup pages are using **Supabase client auth** instead of the **custom API route**:

**File**: `app/signup/tutor/page.tsx` (Line ~127)
```typescript
// ❌ This bypasses the email queue
const { data: authData, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: { ... }
});
```

**Should be**:
```typescript
// ✅ This queues emails
const response = await fetch('/api/auth/signup-with-emails', {
  method: 'POST',
  body: JSON.stringify({
    email, password, fullName, username, role, countryCode
  })
});
```

## 🛠️ The Fix

### Option 1: Update Signup Pages (Recommended)
Update all signup pages to use the API route that queues emails:
- `app/signup/tutor/page.tsx`
- `app/signup/page.tsx` (student)
- `app/signup/parent/page.tsx`

### Option 2: Use Supabase Database Trigger
Create a trigger that automatically queues emails when a new user is created.

### Option 3: Use Supabase Webhooks
Configure Supabase to call your email queue API when users sign up.

## ✅ Recommended Solution: Update Signup Pages

I'll update the signup flow to use the correct API route.

### Changes Needed:

1. **Tutor Signup** (`app/signup/tutor/page.tsx`)
2. **Student Signup** (`app/signup/page.tsx`)
3. **Parent Signup** (`app/signup/parent/page.tsx`)

Each needs to:
- Replace `supabase.auth.signUp()` with API call to `/api/auth/signup-with-emails`
- Handle the response properly
- Still redirect to email verification page

## 🔧 Alternative: Database Trigger (Backup Plan)

If updating signup pages is too risky, we can create a database trigger:

```sql
-- Trigger to auto-queue emails when user is created
CREATE OR REPLACE FUNCTION queue_onboarding_emails_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if role is student, tutor, or parent
  IF NEW.role IN ('student', 'tutor', 'parent') THEN
    -- Insert into queue (immediate welcome email)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 0, NOW(), 'pending');
    
    -- Queue day 1 email (24 hours later)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 1, NOW() + INTERVAL '24 hours', 'pending');
    
    -- Queue day 3 email
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 3, NOW() + INTERVAL '72 hours', 'pending');
    
    -- Queue day 5 email
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 5, NOW() + INTERVAL '120 hours', 'pending');
    
    -- Queue day 7 email
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 7, NOW() + INTERVAL '168 hours', 'pending');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to profiles table
CREATE TRIGGER auto_queue_onboarding_emails
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION queue_onboarding_emails_trigger();
```

## ⚡ Quick Fix (Immediate)

For users who already signed up and didn't get emails, run this SQL:

```sql
-- Manually queue welcome emails for recent users (last 7 days)
INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
SELECT 
  id as user_id,
  role as user_type,
  0 as stage,
  NOW() as scheduled_for,
  'pending' as status
FROM profiles
WHERE created_at > NOW() - INTERVAL '7 days'
  AND role IN ('student', 'tutor', 'parent')
  AND id NOT IN (
    SELECT DISTINCT user_id FROM onboarding_email_queue
  );
```

## 📊 Check If System Is Working

Run these checks:

### 1. Check if cron job is running:
```sql
-- Check recent email sends
SELECT * FROM email_send_logs 
ORDER BY created_at DESC 
LIMIT 20;
```

### 2. Check if emails are being queued:
```sql
-- Check queue
SELECT * FROM onboarding_email_queue 
ORDER BY created_at DESC 
LIMIT 20;
```

### 3. Check Vercel cron logs:
Go to: Vercel Dashboard → Your Project → Deployments → Logs
Search for: "Onboarding Email Cron Job"

## 🎯 Next Steps

1. **Choose a solution**:
   - Option A: Update signup pages (cleanest, but requires code changes)
   - Option B: Database trigger (works immediately, no code changes)

2. **Test the fix**:
   - Sign up as a test user
   - Check `onboarding_email_queue` table
   - Wait 15 minutes for cron job
   - Check email inbox

3. **Backfill existing users** (optional):
   - Run SQL to queue emails for recent signups
   - They'll get welcome emails within 15 minutes

Which solution do you want to implement?
