# 🔍 Debugging Password Reset Emails with Resend

Since you're already using Resend for confirmation emails, but password reset emails aren't arriving, here's how to fix it:

## ✅ Quick Checks

### 1. Check Resend Dashboard
Go to: https://resend.com/emails

**Look for:**
- Are password reset emails showing up in your logs?
- What's their status? (Delivered, Bounced, Spam, etc.)
- Any error messages?

**Common Issues:**
- ❌ **Bounced**: Email address doesn't exist
- ⚠️ **Spam**: Email went to spam folder
- 🔴 **Failed**: Domain not verified or SMTP issue
- ✅ **Delivered**: Email was sent (check spam folder)

### 2. Check Supabase Email Templates

The password reset email might be using a different template than confirmation emails:

1. Go to Supabase Dashboard
2. Navigate to: **Authentication** → **Email Templates**
3. Click **"Reset Password"** (not "Confirm Signup")
4. Verify the template is enabled and configured

**Check these fields:**
- ✅ Subject line is set
- ✅ Email body contains `{{ .ConfirmationURL }}`
- ✅ "From" email matches your verified Resend domain
- ✅ Template is not disabled

### 3. Verify Redirect URL

In your Supabase SMTP/Auth settings:

1. Go to: **Authentication** → **URL Configuration**
2. Check **"Site URL"** is correct:
   - Development: `http://localhost:3000`
   - Production: `https://yourdomain.com`
3. Check **"Redirect URLs"** includes:
   - `http://localhost:3000/reset-password`
   - `https://yourdomain.com/reset-password`

## 🧪 Test Reset Email Manually

### Test 1: Send from Supabase Dashboard
1. Go to: **Authentication** → **Email Templates**
2. Select **"Reset Password"**
3. Click **"Send test email"**
4. Enter your email
5. Check Resend dashboard immediately
6. Did the email appear in Resend logs?

### Test 2: Check Auth Logs
```sql
-- Run in Supabase SQL Editor
SELECT 
  created_at,
  level,
  msg,
  (metadata->>'email') as email
FROM auth.audit_log_entries
WHERE msg LIKE '%password%reset%'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

**What to look for:**
- Are reset requests being logged?
- Any error messages?
- Does the email match what you entered?

## 🔧 Common Resend Issues & Fixes

### Issue 1: Domain Not Verified for Password Resets

**Symptom**: Confirmation emails work, but password resets don't

**Fix**:
1. Go to Resend Dashboard → **Domains**
2. Verify your sending domain is fully verified (green checkmark)
3. Check DNS records are correct
4. If using "From" email like `noreply@yourdomain.com`, domain must be verified

### Issue 2: Different "From" Address

**Symptom**: Password reset uses different sender than confirmations

**Fix**:
1. In Supabase: **Authentication** → **Settings** → **SMTP Settings**
2. Check **"Sender email"** field
3. Make sure it matches your verified Resend domain
4. Example: If domain is `myitutor.com`, use `noreply@myitutor.com`

### Issue 3: Rate Limiting on Resend

**Symptom**: First few emails worked, then stopped

**Fix**:
1. Check Resend dashboard for rate limit warnings
2. Free tier limits:
   - 100 emails/day
   - 3,000 emails/month
3. Upgrade plan if needed

### Issue 4: Email Template HTML Issues

**Symptom**: Emails silently fail or get marked as spam

**Fix**:
1. Simplify the email template (remove complex HTML)
2. Test with plain text version:

```
Subject: Reset your iTutor password

Hi there,

Click here to reset your password:
{{ .ConfirmationURL }}

This link expires in 1 hour.

If you didn't request this, ignore this email.

Thanks,
iTutor Team
```

## 🎯 Step-by-Step Debug Process

### Step 1: Verify Resend is Receiving the Request
```bash
# Check this immediately after requesting a password reset
```
1. Request password reset at `/forgot-password`
2. Go to Resend Dashboard → Emails
3. Refresh the page
4. **Do you see a new email entry?**

**If YES**: Email was sent to Resend ✅
- Check spam folder
- Check email status in Resend (delivered/bounced/spam)
- Check recipient email is correct

**If NO**: Supabase isn't sending to Resend ❌
- Problem is in Supabase SMTP configuration
- Verify SMTP credentials are correct
- Check Supabase Auth logs for errors

### Step 2: Check Email Status in Resend

Click on the email in Resend Dashboard:

**Status: Delivered** ✅
- Email was successfully delivered
- **Check your spam/junk folder**
- Add sender to safe senders list
- Check email filters/rules

**Status: Bounced** ❌
- Email address doesn't exist
- Typo in email address?
- Try a different email provider

**Status: Spam** ⚠️
- Email was marked as spam by recipient's server
- **Check spam folder**
- Improve email content (avoid spammy words)
- Warm up your sending domain

**Status: Failed** 🔴
- SMTP error or domain issue
- Check error message in Resend
- Verify domain DNS records

### Step 3: Compare with Working Confirmation Emails

**Do this**:
1. Sign up a new test account (triggers confirmation email)
2. Request password reset (triggers reset email)
3. Compare both in Resend dashboard

**Check**:
- Same "From" address?
- Same status (both delivered)?
- Same recipient email?
- Any differences in the emails?

## 🔑 Quick Fix Checklist

Run through this checklist:

- [ ] Confirmed Resend is receiving the password reset request
- [ ] Checked spam/junk folder thoroughly
- [ ] Verified "From" email matches verified Resend domain
- [ ] Confirmed redirect URL is correct in Supabase
- [ ] Tested with multiple email addresses (Gmail, Outlook, etc.)
- [ ] Password reset template is enabled in Supabase
- [ ] Checked Resend dashboard for delivery status
- [ ] Reviewed Supabase Auth logs for errors
- [ ] Compared with working confirmation emails
- [ ] Tried sending test email from Supabase dashboard

## 💡 Most Likely Solutions

Based on Resend working for confirmations but not password resets:

### Solution 1: Wrong Redirect URL (80% chance)
```javascript
// In forgot-password/page.tsx, make sure this matches your Supabase config:
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`,
});
```

**Fix**: Add to Supabase → Authentication → URL Configuration → Redirect URLs:
- `http://localhost:3000/reset-password`
- `http://localhost:3000/**` (wildcard for all paths)

### Solution 2: Email Template Not Configured (15% chance)
- Password reset template might be disabled
- Go to Email Templates → Reset Password
- Make sure it's active and contains `{{ .ConfirmationURL }}`

### Solution 3: Going to Spam (5% chance)
- Emails ARE being sent and delivered
- But they're in your spam folder
- Check spam folder in your email client

## 🆘 Still Not Working?

### Get Detailed Logs

Run this in your browser console on the forgot-password page:

```javascript
// After submitting the form, check the response
const { data, error } = await supabase.auth.resetPasswordForEmail('your@email.com', {
  redirectTo: `${window.location.origin}/reset-password`,
});
console.log('Success:', data);
console.log('Error:', error);
```

**What to look for:**
- Any error messages?
- Does it say success?
- Any CORS or network errors?

### Contact Resend Support

If Resend shows "Delivered" but you don't have the email:

1. Forward the Resend delivery log to their support
2. Ask them to trace the email delivery
3. Check if your domain needs SPF/DKIM/DMARC records

### Double-Check Supabase SMTP

Verify your Supabase SMTP settings match Resend:

```
SMTP Host: smtp.resend.com
SMTP Port: 587 (or 465 for SSL)
SMTP Username: resend
SMTP Password: re_xxxxxxxxxxxxx (your Resend API key)
Sender Email: noreply@yourdomain.com (or your verified domain)
Sender Name: iTutor
```

---

**Next Steps:**
1. Check Resend dashboard RIGHT NOW for recent password reset emails
2. Look at their delivery status
3. Come back here with what you find!

The emails are almost certainly being sent to Resend - we just need to figure out what Resend is doing with them. 🔍





