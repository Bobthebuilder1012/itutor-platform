# Fix Edge Function 401 Authentication Errors

## Problem
The `session-reminder-10-min` Edge Function is returning **401 errors** in the Invocations chart, indicating authentication failures when trying to connect to external services (FCM, Web Push, or Supabase itself).

## Root Cause Analysis
A 401 error from an Edge Function typically means:
1. Missing required secrets/environment variables in Supabase
2. Invalid or expired secret values
3. Malformed JSON in secrets (especially `FCM_SERVICE_ACCOUNT_JSON`)

## Required Secrets

The `session-reminder-10-min` Edge Function requires these secrets:

### Core Supabase Secrets
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key with full access

### Firebase Cloud Messaging (for mobile push)
- `FCM_SERVICE_ACCOUNT_JSON` - Full JSON service account from Firebase Console

### Web Push VAPID Keys (for browser push)
- `VAPID_PUBLIC_KEY` - Public key from VAPID generation
- `VAPID_PRIVATE_KEY` - Private key from VAPID generation
- `VAPID_SUBJECT` - Email in format `mailto:your-email@myitutor.com`

## Step-by-Step Fix

### Step 1: Check Current Secrets
In your terminal (where you successfully ran `npx supabase functions deploy`):

```bash
npx supabase secrets list
```

This will show all secrets currently set. Look for:
- Are ALL 6 secrets listed above present?
- Are any showing as "Not set" or empty?

### Step 2: Verify Supabase Core Secrets
These should already be set automatically, but verify:

```bash
# Check if they exist
npx supabase secrets list | findstr SUPABASE
```

If missing, set them:
```bash
npx supabase secrets set SUPABASE_URL=https://your-project.supabase.co
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 3: Fix FCM Secret (Most Common Issue)
The `FCM_SERVICE_ACCOUNT_JSON` must be:
1. Valid JSON (no line breaks, properly escaped)
2. Complete (all fields from Firebase Console)

To set it properly:

**Option A: Using PowerShell (Recommended)**
```powershell
# Save your FCM JSON to a file first: fcm-service-account.json
# Then set it as a secret:
$fcmJson = Get-Content -Path "fcm-service-account.json" -Raw
npx supabase secrets set "FCM_SERVICE_ACCOUNT_JSON=$fcmJson"
```

**Option B: Direct from Firebase Console**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Copy the ENTIRE content (it's a single line of JSON)
5. Run: `npx supabase secrets set FCM_SERVICE_ACCOUNT_JSON=<paste-json-here>`

### Step 4: Set VAPID Keys
If you haven't generated VAPID keys yet:

```bash
npx web-push generate-vapid-keys
```

Then set them:
```bash
npx supabase secrets set VAPID_PUBLIC_KEY=<your-public-key>
npx supabase secrets set VAPID_PRIVATE_KEY=<your-private-key>
npx supabase secrets set VAPID_SUBJECT=mailto:support@myitutor.com
```

### Step 5: Redeploy the Function
After setting/fixing secrets, you MUST redeploy:

```bash
npx supabase functions deploy session-reminder-10-min
```

### Step 6: Test Immediately
After deployment, go to Supabase Dashboard:
1. Navigate to Edge Functions → `session-reminder-10-min`
2. Click the "Test" button
3. Check the response:
   - **Success**: Should return 200 with a JSON response
   - **401**: Secrets still missing/invalid - recheck Steps 2-4
   - **500**: Code error - check Worker Logs for details

### Step 7: Verify Cron Job
Once the function works (no 401s from Test button):

1. Go to Database → Cron Jobs (or SQL Editor)
2. Run this query:

```sql
SELECT 
  jobname,
  schedule,
  command,
  active,
  last_run,
  next_run
FROM cron.job
WHERE command LIKE '%session-reminder-10-min%';
```

3. Verify:
   - `active` is `true`
   - `command` points to the correct function name
   - `next_run` is a future timestamp

If the cron job doesn't exist or is inactive, create it:

```sql
-- Delete old cron jobs if any
SELECT cron.unschedule('session-reminder-10-min-old');
SELECT cron.unschedule('session-reminder-10-min');

-- Create new cron job
SELECT cron.schedule(
  'session-reminder-10-min',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/session-reminder-10-min',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<YOUR-ANON-KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**IMPORTANT**: Replace `your-project` and `<YOUR-ANON-KEY>` with your actual values.

## Verification

After completing all steps:

1. Wait 5-10 minutes for the cron to trigger
2. Go back to Edge Functions → Invocations chart
3. You should see:
   - **Green bars (2xx)**: Success! Function is working
   - **Yellow bars (4xx)**: Still auth issues - recheck secrets
   - **Red bars (5xx)**: Code error - check Worker Logs

## Common Mistakes

❌ **Setting secrets in `.env.local`** - These only work locally, not in deployed Edge Functions  
✅ Use `npx supabase secrets set` to configure production secrets

❌ **Forgetting to redeploy after setting secrets** - Secrets don't update automatically  
✅ Always run `npx supabase functions deploy` after changing secrets

❌ **Invalid JSON in FCM_SERVICE_ACCOUNT_JSON** - Line breaks or escape issues  
✅ Use the PowerShell method or copy as a single line from Firebase

❌ **Wrong VAPID_SUBJECT format** - Missing `mailto:` prefix  
✅ Must be `mailto:your-email@example.com`

## Quick Diagnostic Command

Run this to check all secrets at once:

```bash
npx supabase secrets list | findstr "SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY FCM_SERVICE_ACCOUNT_JSON VAPID"
```

All 6 secrets should appear. If any are missing, follow Steps 2-4 above.

## Need Help?

If after following all steps you still see 401 errors:
1. Share the output of `npx supabase secrets list`
2. Share the "Test" button response from Supabase Dashboard
3. Share any error messages from Worker Logs
