# 📧 Email Not Working? Here's How to Fix It

## ⚠️ Why You're Not Receiving Emails

By default, Supabase has **email rate limits** in development:
- **4 emails per hour** maximum
- If you've exceeded this, you won't get any more emails until the hour resets

## 🔍 Check if Emails Are Being Sent

### Option 1: Check Supabase Auth Logs
1. Go to your **Supabase Dashboard**
2. Navigate to: **Authentication** → **Logs**
3. Look for password reset entries
4. Check if they show "sent" or "rate limit exceeded"

### Option 2: Check Inbucket (Local Development)
If you're running Supabase locally:
1. Go to: `http://localhost:54324`
2. Check the inbox for your test emails

## ✅ Quick Fixes

### Fix 1: Wait for Rate Limit Reset
- **Wait 1 hour** from your last email
- The rate limit will automatically reset
- Then try the "Resend email" button

### Fix 2: Use a Different Email Address
- Try with a different email address
- Each unique email counts separately toward the limit

### Fix 3: Enable Confirm Email Disabled (Development Only)
**⚠️ Not recommended for production!**

1. Go to Supabase Dashboard
2. Navigate to: **Authentication** → **Settings**
3. Scroll to "Email Auth"
4. Toggle **OFF**: "Enable email confirmations"
5. This allows testing without email verification

### Fix 4: Set Up Custom SMTP (Recommended)
This removes rate limits and ensures reliable delivery.

#### Quick Setup with Gmail (Free):
1. Go to: **Authentication** → **Settings** → **SMTP Settings**
2. **Enable Custom SMTP**
3. Configure:
   ```
   SMTP Host: smtp.gmail.com
   SMTP Port: 587
   SMTP Username: your-email@gmail.com
   SMTP Password: [Your Gmail App Password]
   Sender Email: your-email@gmail.com
   Sender Name: iTutor
   ```

4. **Generate Gmail App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Sign in to your Google account
   - Create new app password for "Mail"
   - Copy the 16-character password
   - Use this as your SMTP Password

#### Professional Email Services (Production):

**SendGrid (Recommended):**
- Free tier: 100 emails/day
- Very reliable
- Easy setup

Setup:
1. Create account at: https://sendgrid.com
2. Get API key
3. In Supabase SMTP Settings:
   ```
   SMTP Host: smtp.sendgrid.net
   SMTP Port: 587
   SMTP Username: apikey
   SMTP Password: [Your SendGrid API Key]
   Sender Email: noreply@yourdomain.com
   Sender Name: iTutor
   ```

**AWS SES:**
- Very cheap ($.10 per 1000 emails)
- Highly reliable
- Requires domain verification

**Mailgun:**
- Free tier: 100 emails/day
- Good for small projects

## 🧪 Testing Email Delivery

### Test 1: Send a Test Email
```javascript
// Run this in your browser console on any page
const { data, error } = await supabase.auth.resetPasswordForEmail('your-test@email.com', {
  redirectTo: `${window.location.origin}/reset-password`,
});
console.log('Result:', data, error);
```

### Test 2: Check Email Template
1. Go to: **Authentication** → **Email Templates**
2. Click "Reset Password"
3. Click "Send test email"
4. Enter your email
5. Check if it arrives

## 📊 Current Status Check

Run these checks:

### Check 1: Is Email Confirmation Required?
```sql
-- Run in Supabase SQL Editor
SELECT 
  raw_app_meta_data->>'provider' as provider,
  email_confirmed_at,
  email
FROM auth.users
WHERE email = 'your-test@email.com';
```

### Check 2: Check Auth Logs
```sql
-- Run in Supabase SQL Editor
SELECT 
  created_at,
  level,
  msg
FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

## 🚀 Recommended Setup for Your Project

### Development (Local Testing):
```
Option A: Disable email confirmation temporarily
Option B: Use Inbucket (if using local Supabase)
Option C: Set up Gmail SMTP (free)
```

### Staging/Production:
```
Must use: Custom SMTP provider
Recommended: SendGrid or AWS SES
Fallback: Gmail (not ideal for high volume)
```

## 📝 Step-by-Step: Set Up SendGrid (5 minutes)

1. **Create SendGrid Account**
   - Go to: https://sendgrid.com/pricing/
   - Sign up for free tier (100 emails/day)
   - Verify your email

2. **Create API Key**
   - Go to: Settings → API Keys
   - Click "Create API Key"
   - Name: "iTutor Supabase"
   - Permissions: "Full Access" (or just "Mail Send")
   - Copy the API key (shown only once!)

3. **Verify Sender Identity**
   - Go to: Settings → Sender Authentication
   - Click "Verify a Single Sender"
   - Enter your email (e.g., noreply@myitutor.com)
   - Verify via email link

4. **Configure in Supabase**
   - Go to Supabase: Authentication → Settings → SMTP Settings
   - Enable Custom SMTP
   - Fill in:
     ```
     Host: smtp.sendgrid.net
     Port: 587
     Username: apikey
     Password: [Paste your API key]
     Sender Email: [Your verified sender email]
     Sender Name: iTutor
     ```
   - Save changes

5. **Test It**
   - Go to: Authentication → Email Templates
   - Select "Reset Password"
   - Click "Send test email"
   - Enter your email
   - Check inbox (should arrive in seconds!)

## 🆘 Still Not Working?

### Debug Checklist:
- [ ] Checked spam/junk folder
- [ ] Waited for rate limit reset (1 hour)
- [ ] Verified email in Supabase Auth logs
- [ ] SMTP credentials are correct
- [ ] Sender email is verified
- [ ] No typos in email address
- [ ] Firewall/antivirus not blocking
- [ ] Browser console shows no errors

### Get Help:
1. Check Supabase Auth logs for specific errors
2. Test with a different email provider (Gmail, Outlook, etc.)
3. Verify your Supabase project has email enabled
4. Check Supabase status page: https://status.supabase.com

## 💡 Pro Tips

1. **Always use custom SMTP in production** - More reliable and no rate limits
2. **Test with multiple email providers** - Gmail, Outlook, Yahoo, etc.
3. **Monitor delivery rates** - Set up email delivery tracking
4. **Warm up new SMTP accounts** - Start with low volume, gradually increase
5. **Use a dedicated sending domain** - Better deliverability (e.g., mail.myitutor.com)

---

**Quick Solution for Right Now:**
1. Wait 1 hour for rate limit to reset
2. Use the new "Resend email" button (appears after 60 seconds)
3. Check spam folder
4. If still nothing, set up Gmail SMTP (takes 5 minutes)

**Long-term Solution:**
Set up SendGrid or AWS SES before deploying to production!





