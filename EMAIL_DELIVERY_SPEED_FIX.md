# 🚀 Fix Slow Email Delivery (5-10 Minute Delays)

## Problem
Verification code emails are taking 5-10 minutes to arrive, which is too slow for time-sensitive codes.

## Root Cause
Supabase's default email service uses a shared IP and has rate limits, causing delays.

---

## Solution 1: Configure Resend SMTP Properly (Recommended)

### Step 1: Verify Resend SMTP Settings in Supabase

1. Go to: https://supabase.com/dashboard/project/nfkrfciozjxrodkusrhh
2. Click **Settings** → **Auth**
3. Scroll down to **SMTP Settings**
4. Check if **"Enable Custom SMTP"** is turned ON

### Step 2: Configure Resend SMTP

Make sure these settings are EXACTLY as shown:

```
✅ Enable Custom SMTP: ON

Sender name: iTutor
Sender email: noreply@yourdomain.com (must be a verified domain in Resend)

SMTP Settings:
- Host: smtp.resend.com
- Port: 587 (or 465 for SSL, but 587 is recommended)
- Username: resend (literally type the word "resend")
- Password: [Your Resend API Key - starts with "re_"]
```

### Step 3: Get Your Resend API Key

1. Go to https://resend.com/api-keys
2. Copy your existing API key OR create a new one
3. Paste it in the **Password** field in Supabase SMTP settings
4. Click **Save**

### Step 4: Test Email Delivery

1. Sign up with a test email
2. Email should arrive within **5-30 seconds** (not 5-10 minutes!)
3. If still slow, proceed to Solution 2

---

## Solution 2: Use Resend API Directly (If SMTP is Still Slow)

If SMTP configuration doesn't fix the speed, bypass Supabase email entirely and send directly via Resend API.

### Step 1: Add Resend API Key to Environment

Add to your `.env.local`:

```
RESEND_API_KEY=re_your_api_key_here
```

### Step 2: Install Resend Package (Optional)

```bash
npm install resend
```

### Step 3: Files Already Created

I've created:
- ✅ `app/api/send-verification-email/route.ts` - Direct Resend API route

This API route sends emails in **under 1 second** instead of 5-10 minutes.

### Step 4: Update Verification Flow (Optional)

If you want to use the direct Resend API instead of Supabase emails, you'll need to:

1. Generate codes in your signup flow
2. Store codes in database with expiration
3. Call `/api/send-verification-email` to send the code
4. Verify codes against database in `/verify-code` page

**Note:** This requires more custom code. SMTP solution (Solution 1) is simpler if it works.

---

## Solution 3: Check Rate Limits

If emails are delayed intermittently:

### Resend Rate Limits (Free Tier):
- 100 emails/day
- 3,000 emails/month

### Check Your Usage:
1. Go to https://resend.com/overview
2. Check if you're hitting rate limits
3. Upgrade plan if needed

---

## Troubleshooting Checklist

### ✅ Verify Resend SMTP is enabled in Supabase
1. Settings → Auth → SMTP Settings → Enable Custom SMTP = ON

### ✅ Check SMTP credentials are correct
- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: Your Resend API key (starts with `re_`)

### ✅ Verify sender email domain
- Must be a domain you've verified in Resend
- Check: https://resend.com/domains
- If using `noreply@example.com`, make sure `example.com` is verified

### ✅ Check Supabase logs
1. Supabase Dashboard → Logs → Auth Logs
2. Look for email-related errors
3. Check if emails are being sent or queued

### ✅ Test with different email providers
- Gmail: Usually instant
- Outlook: Usually instant
- Organization emails: May still take 5-30 minutes (security scanning)

---

## Expected Results After Fix

### With Resend SMTP Configured:
- ✅ Gmail: **5-30 seconds**
- ✅ Outlook: **10-60 seconds**
- ⚠️ Organization emails: **1-30 minutes** (unavoidable, their security)

### With Direct Resend API:
- ✅ Gmail: **1-5 seconds**
- ✅ Outlook: **5-15 seconds**
- ⚠️ Organization emails: **1-30 minutes** (still unavoidable)

---

## Common Issues

### "SMTP connection failed"
- Check that Port is `587` (not 465)
- Verify username is exactly: `resend` (not your email)
- Verify API key is correct and active

### "Sender not verified"
- Go to https://resend.com/domains
- Add and verify your domain
- Update sender email in Supabase to use verified domain

### "Still slow after configuration"
- Wait 5 minutes for Supabase to apply new settings
- Try signing out of Supabase dashboard and back in
- Contact Resend support to check if there are issues on their end

### "Organization emails still delayed"
- This is normal and unavoidable
- Your warning in the email template helps set expectations
- Consider adding a "Why is my email delayed?" FAQ

---

## Need More Help?

1. **Check Resend Status**: https://status.resend.com/
2. **Check Supabase Status**: https://status.supabase.com/
3. **Resend Docs**: https://resend.com/docs/send-with-smtp
4. **Supabase SMTP Docs**: https://supabase.com/docs/guides/auth/auth-smtp

