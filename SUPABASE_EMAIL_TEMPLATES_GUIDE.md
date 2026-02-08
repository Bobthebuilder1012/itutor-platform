# Supabase Email Templates Update Guide

## Overview
This guide will help you update all Supabase auth email templates to match the iTutor brand style.

## Template Files Created
I've created **5 HTML template files** for all Supabase auth emails:

1. ✅ `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html` - Email confirmation/signup verification
2. ✅ `SUPABASE_RESET_PASSWORD_TEMPLATE.html` - Password reset requests
3. ✅ `SUPABASE_MAGIC_LINK_TEMPLATE.html` - Magic link sign-in
4. ✅ `SUPABASE_CHANGE_EMAIL_TEMPLATE.html` - Email address change confirmation
5. ✅ `SUPABASE_INVITE_USER_TEMPLATE.html` - User invitations

## Important: Enable Email OTP First

Before updating templates, you need to enable Email OTP (One-Time Password) in Supabase:

1. Go to: https://supabase.com/dashboard
2. Select your project: **iTutor**
3. Click **Authentication** → **Providers**
4. Find **Email** provider
5. Make sure these settings are enabled:
   - ✅ **Enable Email provider**
   - ✅ **Enable Email OTP** (this allows verification codes instead of magic links)
6. Set **OTP Length** to **8 digits** (to match your verification page)
7. Save changes

## How to Update Supabase Email Templates

### Step 1: Access Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Select your project: **iTutor**
3. Click **Settings** (gear icon in left sidebar)
4. Click **Auth** tab
5. Scroll down to **Email Templates** section

### Step 2: Update Each Template

#### Template 1: Confirm Signup
1. In Supabase Dashboard → Auth → Email Templates
2. Find **"Confirm signup"** template
3. Click to expand it
4. **Subject line**: Keep as `Confirm Your Email - iTutor` or customize
5. **Message body (HTML)**: 
   - Open `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html` 
   - Copy **ALL** the content
   - Paste into the message body field
6. Click **Save**

#### Template 2: Reset Password
1. Find **"Reset password"** template
2. Click to expand it
3. **Subject line**: `Reset Your Password - iTutor`
4. **Message body (HTML)**: 
   - Open `SUPABASE_RESET_PASSWORD_TEMPLATE.html`
   - Copy ALL content
   - Paste into the message body field
5. Click **Save**

#### Template 3: Magic Link
1. Find **"Magic Link"** template
2. Click to expand it
3. **Subject line**: `Sign In to iTutor`
4. **Message body (HTML)**: 
   - Open `SUPABASE_MAGIC_LINK_TEMPLATE.html`
   - Copy ALL content
   - Paste into the message body field
5. Click **Save**

#### Template 4: Change Email Address
1. Find **"Change Email Address"** template
2. Click to expand it
3. **Subject line**: `Confirm Email Change - iTutor`
4. **Message body (HTML)**: 
   - Open `SUPABASE_CHANGE_EMAIL_TEMPLATE.html`
   - Copy ALL content
   - Paste into the message body field
5. Click **Save**

#### Template 5: Invite User
1. Find **"Invite user"** template
2. Click to expand it
3. **Subject line**: `You've Been Invited to iTutor`
4. **Message body (HTML)**: 
   - Open `SUPABASE_INVITE_USER_TEMPLATE.html`
   - Copy ALL content
   - Paste into the message body field
5. Click **Save**

### Step 3: Test the Templates

#### Test Email Confirmation:
1. Create a test user account
2. Check if the email arrives with the new design
3. Verify:
   - ✅ Logo is centered
   - ✅ Button is iTutor green
   - ✅ Footer shows social links
   - ✅ Copyright is correct

#### Test Password Reset:
1. Go to your login page
2. Click "Forgot Password"
3. Enter a test email
4. Check the reset email has the new design

#### Test Magic Link (if enabled):
1. Try signing in with magic link
2. Check the email design

## Important Notes

### Supabase Variables
These templates use Supabase's built-in template variables:
- `{{ .Token }}` - The verification code (for email OTP)
- `{{ .ConfirmationURL }}` - The confirmation/action link (for magic links, password reset, etc.)
- These are automatically replaced by Supabase when sending emails

**For Email Verification**: The confirm email template uses `{{ .Token }}` which displays the verification code (e.g., 12345678) that users enter on your verification page.

**For Password Reset/Magic Links**: Other templates use `{{ .ConfirmationURL }}` which is a clickable link.

### Logo URL
The templates use: `https://myitutor.com/assets/logo/itutor-logo-dark.png`

**Make sure this URL is accessible!** If the logo doesn't load:
1. Verify the file exists at that URL
2. Check CORS settings
3. Alternatively, use a direct image URL from your CDN

### Email Testing Tools
Test how your emails look in different clients:
- Use https://litmus.com/email-testing (paid)
- Or https://www.mail-tester.com/ (free, limited)
- Or send test emails to Gmail, Outlook, Yahoo

### Mobile Responsiveness
All templates are mobile-responsive and will look good on:
- ✅ Desktop (Gmail, Outlook, Yahoo)
- ✅ Mobile (iPhone Mail, Gmail app, Outlook app)
- ✅ Dark mode (text remains readable)

## Design Features

All templates include:
- ✅ **iTutor logo** in black header
- ✅ **Brand green gradient** buttons (#199358 → #157a48)
- ✅ **Social media links** (Facebook, Instagram, LinkedIn)
- ✅ **Updated footer**: "© iTutor. Nora Digital, Ltd."
- ✅ **Consistent styling** matching onboarding emails
- ✅ **Clean, professional design**
- ✅ **Accessible color contrast**

## Troubleshooting

### Logo Not Showing:
- Check if `https://myitutor.com/assets/logo/itutor-logo-dark.png` loads in your browser
- If not, update the `src` attribute in each template to a working URL

### Button Not Clickable:
- Make sure you copied the ENTIRE HTML template
- The `{{ .ConfirmationURL }}` variable must be intact
- Don't modify the href attribute

### Email Looks Broken:
- Some email clients strip certain CSS
- The templates use inline styles for maximum compatibility
- If issues persist, test in Gmail first (it's the strictest)

### Changes Not Showing:
- Clear browser cache
- Wait 5 minutes for Supabase to apply changes
- Try in incognito/private browsing mode

### Code Shows as {{ .Token }} Instead of Numbers:
- Make sure **Email OTP is enabled** in Supabase (Authentication → Providers → Email)
- Check that OTP length is set to **8 digits**
- Verify you're using the signup method that triggers OTP (not magic link)

### Code is 6 digits instead of 8:
- Go to: Authentication → Providers → Email
- Change **OTP Length** from 6 to 8 digits
- Save and retry signup

## Quick Checklist

Before you finish:
- [ ] Updated all 5 email templates in Supabase
- [ ] Saved each template
- [ ] Tested email confirmation with new design
- [ ] Tested password reset with new design
- [ ] Verified logo loads correctly
- [ ] Verified buttons link correctly
- [ ] Checked mobile view
- [ ] Confirmed footer text is correct

## Need Help?

If you encounter issues:
1. Check Supabase Dashboard → Logs → Auth Logs
2. Look for email sending errors
3. Verify SMTP settings are correct (Settings → Auth → SMTP)
4. Contact Supabase support if emails aren't being sent

---

**Pro Tip**: Bookmark this guide for future template updates!
