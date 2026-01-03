# Password Reset Feature - Setup & Testing Guide

## ✅ Implementation Complete

The password reset feature has been fully implemented with the following components:

### Files Created/Modified:

1. **`app/login/page.tsx`** - Added "Forgot password?" link
2. **`app/forgot-password/page.tsx`** - Email entry page for password reset
3. **`app/reset-password/page.tsx`** - New password creation page

## 🔄 How It Works

### User Flow:
1. User clicks "Forgot password?" on the login page
2. User enters their email on `/forgot-password`
3. User receives an email with a reset link
4. User clicks the link → redirected to `/reset-password`
5. User creates a new password
6. User is redirected to login with their new password

## ⚙️ Supabase Email Configuration

### Setup Email Templates (Required)

1. **Go to Supabase Dashboard**
   - Navigate to: Authentication → Email Templates

2. **Configure "Reset Password" Template**
   ```
   Subject: Reset your iTutor password
   
   Body:
   Hi there,
   
   You requested to reset your password for iTutor.
   
   Click the link below to create a new password:
   
   {{ .ConfirmationURL }}
   
   This link expires in 1 hour.
   
   If you didn't request this, please ignore this email.
   
   Thanks,
   The iTutor Team
   ```

3. **Confirm URL Configuration**
   - The reset link redirects to: `${YOUR_SITE_URL}/reset-password`
   - Example: `https://yourdomain.com/reset-password`
   - In Supabase Dashboard → Authentication → URL Configuration
   - Set "Site URL" to your production URL
   - For local dev: `http://localhost:3000`

### Email Provider Options

**Development (Default):**
- Supabase sends emails via their default provider
- Limited to 4 emails per hour
- Good for testing

**Production (Recommended):**
Set up a custom SMTP provider for reliable delivery:

1. Go to: Authentication → Settings → SMTP Settings
2. Configure your SMTP provider (SendGrid, AWS SES, Mailgun, etc.)
3. Example for SendGrid:
   - SMTP Host: `smtp.sendgrid.net`
   - SMTP Port: `587`
   - SMTP Username: `apikey`
   - SMTP Password: `[Your SendGrid API Key]`
   - From Email: `noreply@myitutor.com`
   - From Name: `iTutor`

## ⚠️ Email Not Working?

**Common Issue**: Supabase has a **4 emails per hour** rate limit in development mode.

**Solutions**:
1. Wait 1 hour for rate limit to reset
2. Use the "Resend email" button (available after 60 seconds)
3. Set up custom SMTP provider (removes limits)
4. See `EMAIL_NOT_WORKING_FIX.md` for detailed troubleshooting

## 🧪 Testing the Flow

### Manual Testing Steps:

1. **Test Forgot Password Form**
   ```
   Navigate to: http://localhost:3000/forgot-password
   Enter a valid user email
   Submit form
   ```

2. **Check Email Delivery**
   - Check the email inbox
   - Check spam/junk folder
   - Supabase Auth logs: Dashboard → Authentication → Logs
   - If not received, wait 60 seconds and use "Resend email" button

3. **Test Reset Link**
   - Click the link in the email
   - Should redirect to `/reset-password`
   - Should show password creation form

4. **Test Password Reset**
   - Enter new password (min 8 characters)
   - Confirm password
   - Submit form
   - Should show success message
   - Should redirect to login

5. **Test Login with New Password**
   - Go to `/login`
   - Use email + new password
   - Should successfully log in

### Error Cases to Test:

- ✅ Email not in database → Shows success (for security)
- ✅ Expired reset link (>1 hour) → Shows error + request new link
- ✅ Used reset link → Shows error + request new link
- ✅ Passwords don't match → Shows error
- ✅ Password too short (<8 chars) → Shows error

## 🔒 Security Features

1. **Email Privacy**: Even if email doesn't exist, we show success message (prevents email enumeration)
2. **Link Expiration**: Reset links expire after 1 hour
3. **Single Use**: Each link can only be used once
4. **Password Requirements**: Minimum 8 characters
5. **Session Validation**: Verifies valid session before allowing reset

## 🎨 UI Features

- ✅ Modern dark theme matching iTutor design
- ✅ Loading states and spinners
- ✅ Clear error messages
- ✅ Success confirmations
- ✅ Helpful instructions
- ✅ Mobile responsive
- ✅ Accessible forms

## 📝 User-Facing Pages

### Login Page (`/login`)
- Added "Forgot password?" link next to password field
- Links to `/forgot-password`

### Forgot Password Page (`/forgot-password`)
- Email input form
- Success state with instructions
- **Resend email button** (available after 60-second cooldown)
- Real-time countdown timer
- Success/error messages for resend attempts
- Option to try different email
- Link back to login

### Reset Password Page (`/reset-password`)
- Only accessible via email link
- New password + confirm password fields
- Password requirements shown
- Success state with auto-redirect
- Invalid link handling

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Configure Supabase Site URL in dashboard
- [ ] Set up custom SMTP provider (recommended)
- [ ] Customize email template with your branding
- [ ] Test with real email addresses
- [ ] Test on production domain
- [ ] Monitor auth logs for issues
- [ ] Set up email delivery monitoring

## 📧 Email Template Customization

You can customize the email template in Supabase Dashboard:

```html
<h2>Reset Your iTutor Password</h2>
<p>Hi there,</p>
<p>We received a request to reset your password for your iTutor account.</p>
<p>Click the button below to create a new password:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a></p>
<p><small>Or copy this link: {{ .ConfirmationURL }}</small></p>
<p><small>This link expires in 1 hour.</small></p>
<p>If you didn't request this, please ignore this email. Your password won't be changed.</p>
<p>Thanks,<br>The iTutor Team</p>
```

## 🐛 Troubleshooting

### Emails Not Sending:
- Check Supabase Auth logs
- Verify email address is confirmed in Supabase
- Check SMTP configuration
- Look in spam/junk folder
- Try resending after 1 minute

### Reset Link Not Working:
- Link may be expired (>1 hour)
- Link may have been already used
- Browser cookies may be blocked
- Try incognito/private browsing mode

### Password Not Updating:
- Check console for errors
- Verify session is valid
- Check Supabase Auth logs
- Ensure password meets requirements (8+ characters)

## 📱 Mobile Support

All pages are fully responsive and work on:
- ✅ Desktop browsers
- ✅ Tablets
- ✅ Mobile phones
- ✅ Different screen sizes

## 🔗 Related Features

This password reset feature is also available in the settings pages for logged-in users:
- `/student/settings` - Student password reset
- `/parent/settings` - Parent password reset
- `/tutor/settings` - Tutor password reset
- `/reviewer/settings` - Reviewer password reset

---

**Status**: ✅ Ready for production
**Last Updated**: January 2026

