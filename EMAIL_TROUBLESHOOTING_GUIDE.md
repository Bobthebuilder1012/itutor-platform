# Email Delivery Troubleshooting Guide

## 🔍 Step 1: Run DEBUG_WHY_NO_EMAILS.sql

This will tell you exactly what's wrong. Run it and look for:

### Possible Issues:

#### 🔴 Issue 1: User Not Queued
**Symptom**: Section 1 shows no entries
**Cause**: Trigger didn't fire when user signed up
**Fix**: 
- Check if trigger exists (Section 6)
- Verify user has role 'student', 'tutor', or 'parent'
- Re-run FIX_WELCOME_EMAILS_NEW_USERS_ONLY.sql

#### 🔴 Issue 2: Cron Job Not Running
**Symptom**: Section 2 shows overdue emails, but Section 3 shows no send attempts
**Cause**: Vercel cron job is not running
**Fix**:
1. Check Vercel Dashboard → Your Project → Crons
2. Verify `/api/cron/send-onboarding-emails` is listed
3. Check if cron job has errors in logs
4. Verify `CRON_SECRET` environment variable is set

#### 🔴 Issue 3: Email Templates Missing
**Symptom**: Section 4 shows "Missing" status
**Cause**: Email templates not in database
**Fix**: Run POPULATE_EMAIL_TEMPLATES.sql

#### 🔴 Issue 4: Email Sending Fails
**Symptom**: Section 3 shows "failed" status
**Cause**: Resend API issues
**Fix**:
- Check `RESEND_API_KEY` environment variable
- Verify API key is valid at resend.com
- Check error message in Section 3

## 🔧 Quick Fixes

### Fix 1: Manually Trigger Cron Job (Test)
```bash
# Call your cron endpoint manually to test
curl -X GET "https://your-domain.vercel.app/api/cron/send-onboarding-emails" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Replace:
- `your-domain.vercel.app` with your actual domain
- `YOUR_CRON_SECRET` with your actual cron secret

### Fix 2: Check Environment Variables
Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Required variables:
- ✅ `RESEND_API_KEY` - Your Resend API key
- ✅ `CRON_SECRET` - Secret for cron job authentication
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - For database access
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase URL

### Fix 3: Check Vercel Cron Configuration
File: `vercel.json`
Should contain:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-onboarding-emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Fix 4: Manual Email Send (Emergency)
If cron isn't working, manually queue and send:

```sql
-- 1. Make sure user is queued
SELECT * FROM onboarding_email_queue WHERE user_type = 'student' ORDER BY created_at DESC LIMIT 1;

-- 2. If not queued, manually add:
INSERT INTO onboarding_email_queue (user_id, user_type, stage, next_send_at, is_active)
VALUES (
  'USER_ID_HERE',  -- Get from profiles table
  'student',       -- or 'tutor' or 'parent'
  0,              -- stage 0 = welcome email
  NOW(),
  true
);
```

Then manually call the cron endpoint (see Fix 1 above).

## 📊 Common Scenarios

### Scenario A: "User queued, but cron not running"
**Solution**: Redeploy your Vercel app to activate cron jobs
```bash
git commit --allow-empty -m "Activate cron jobs"
git push origin main
```

### Scenario B: "Cron running but emails fail"
**Solution**: Check Resend API key and domain verification
- Go to resend.com → Domains
- Verify your sending domain is verified
- Check API key has send permissions

### Scenario C: "Everything looks good but still no emails"
**Solution**: Check spam folder, then verify:
1. Recipient email is valid
2. Resend account has send quota remaining
3. Check Resend dashboard for delivery logs

## 🎯 Next Steps

1. Run `DEBUG_WHY_NO_EMAILS.sql` and check the output
2. Share the results with me - specifically:
   - Section 1 (Queue entries)
   - Section 2 (Overdue count)
   - Section 3 (Send logs)
   - Section 7 (Diagnosis)

Then we can pinpoint the exact issue!
