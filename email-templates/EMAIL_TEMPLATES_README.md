# iTutor Email Templates - Complete Guide

## Overview

This directory contains 9 professional, spam-safe email templates for all Supabase authentication and notification emails. Each template is designed with iTutor branding, uses button CTAs, and includes plain text versions for maximum deliverability.

## Template Files

### Authentication Emails (6 templates)

1. **`confirm-signup.html`** - Welcome email with email confirmation
   - **Subject:** "Confirm your iTutor account"
   - **When sent:** User signs up for a new account
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 24 hours

2. **`invite-user.html`** - Team/admin invitation email
   - **Subject:** "You're invited to join iTutor"
   - **When sent:** Admin invites someone to join
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 7 days

3. **`magic-link.html`** - Passwordless sign-in email
   - **Subject:** "Sign in to your iTutor account"
   - **When sent:** User requests magic link login
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 1 hour

4. **`change-email.html`** - Confirm new email address
   - **Subject:** "Confirm your new email address"
   - **When sent:** User changes their email
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 24 hours

5. **`reset-password.html`** - Password reset email
   - **Subject:** "Reset your iTutor password"
   - **When sent:** User requests password reset
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 1 hour

6. **`reauthentication.html`** - Identity verification for sensitive actions
   - **Subject:** "Verify your identity"
   - **When sent:** User attempts sensitive account changes
   - **Variable:** `{{ .ConfirmationURL }}`
   - **Expiration:** 15 minutes

### Notification Emails (3 templates)

7. **`notify-password-changed.html`** - Password change confirmation
   - **Subject:** "Your password has been changed"
   - **When sent:** After password is successfully changed
   - **Action:** Review account security
   - **No expiration** (informational)

8. **`notify-email-changed.html`** - Email change confirmation
   - **Subject:** "Your email address has been updated"
   - **When sent:** After email is successfully changed
   - **Action:** View account settings
   - **Note:** Sent to both old and new email addresses

9. **`notify-phone-changed.html`** - Phone number change confirmation
   - **Subject:** "Your phone number has been updated"
   - **When sent:** After phone number is successfully changed
   - **Action:** Review account settings
   - **No expiration** (informational)

## How to Use These Templates

### Step 1: Access Supabase Email Templates

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Navigate to: **Authentication** → **Email Templates**

### Step 2: Update Each Template

For each email type:

1. **Click the template name** (e.g., "Confirm signup", "Reset Password")
2. **Copy the HTML content** from the corresponding `.html` file
3. **Paste into the "Message (Body)" field** in Supabase
4. **Update the Subject line** (shown at the top of each file)
5. **Click "Save"**

### Step 3: Configure SMTP Settings

Make sure your SMTP is configured:

**Sender Information:**
- **Sender email:** `noreply@myitutor.com`
- **Sender name:** `iTutor`

**SMTP Provider:** Resend (or your configured provider)
- Ensure domain is verified
- SPF, DKIM, DMARC records are set up

## Template Customization

### Updating the Logo

Replace this line in each template:
```html
<h1 style="margin: 0; color: #10b981; font-size: 28px; font-weight: 700;">iTutor</h1>
```

With an image:
```html
<img src="https://yourdomain.com/logo.png" alt="iTutor" style="height: 40px;">
```

### Changing Button Colors

Current: `#10b981` (iTutor green)

To change, find and replace:
```html
background-color: #10b981
```

With your color:
```html
background-color: #YOUR_COLOR_HERE
```

### Updating Links

For notification emails, update the settings page URL:
```html
href="https://myitutor.com/settings"
```

Change to your actual domain when live.

## Design Specifications

### Colors
- **Primary:** `#10b981` (iTutor Green)
- **Hover:** `#059669` (Darker Green)
- **Text:** `#111827` (Dark Gray)
- **Muted:** `#6b7280` (Medium Gray)
- **Background:** `#f3f4f6` (Light Gray)

### Typography
- **Font:** System fonts (Arial, Helvetica, sans-serif)
- **Heading:** 24px, bold
- **Body:** 16px, regular
- **Small text:** 14px

### Button Style
- **Padding:** 14px 28px
- **Border radius:** 6px
- **Font weight:** 600 (Semi-bold)
- **Font size:** 16px

## Spam Prevention Features

All templates follow these anti-spam best practices:

✅ **Short, clear subject lines** (under 50 characters)
✅ **Professional, friendly tone** (no urgency language)
✅ **No excessive punctuation** (no "!!!" or "URGENT")
✅ **Clear call-to-action buttons** (not just text links)
✅ **Fallback text links** (accessibility & email client compatibility)
✅ **Expiration times clearly stated** (for time-sensitive emails)
✅ **Security disclaimers** (for unauthorized action warnings)
✅ **Support contact information** (builds trust)
✅ **Plain text versions included** (better deliverability)

## Testing Your Email Templates

### Test 1: Send Test Email from Supabase

1. Go to **Authentication** → **Email Templates**
2. Select a template
3. Click **"Send test email"**
4. Enter your email address
5. Check inbox (and spam folder)

### Test 2: Mail Tester Score

1. Go to: https://www.mail-tester.com
2. Get the test email address
3. Send a test email to that address
4. Check your score (aim for 9/10 or higher)

### Test 3: Multiple Email Clients

Test templates in:
- ✅ Gmail (desktop & mobile)
- ✅ Outlook (desktop & mobile)
- ✅ Apple Mail (desktop & mobile)
- ✅ Yahoo Mail
- ✅ ProtonMail

### Test 4: Button Functionality

1. Click the button in received email
2. Verify it goes to correct URL
3. Check fallback text link works too
4. Test on mobile devices

## Plain Text Versions

Each template includes a plain text version in HTML comments at the bottom of the file. Supabase automatically uses these for email clients that don't support HTML.

**Location:** At the bottom of each `.html` file:
```html
<!--
PLAIN TEXT VERSION:
[Plain text content here]
-->
```

If needed, you can extract and customize these for your email provider.

## Troubleshooting

### Emails Going to Spam

**Check:**
- [ ] SPF, DKIM, DMARC records are configured
- [ ] Using custom domain (not shared domain)
- [ ] Subject line is professional (no urgency words)
- [ ] Sender name is consistent
- [ ] Test with Mail Tester (score should be 9+)

**Fix:**
- Update DNS records in your domain provider
- Simplify email content if needed
- Use your own verified domain for sending

### Buttons Not Displaying

**Issue:** Some email clients don't support button styling

**Fix:** Fallback text link is already included below each button. No action needed.

### Variables Not Replaced

**Issue:** `{{ .ConfirmationURL }}` appears as text in email

**Fix:** 
- Ensure you're using Supabase's email template system
- Don't modify the variable syntax
- Save template in Supabase dashboard, not via SMTP

### Wrong Sender Address

**Issue:** Emails show wrong "From" address

**Fix:**
- Update SMTP settings in Supabase
- Change **"Sender email"** to `noreply@myitutor.com`
- Change **"Sender name"** to `iTutor`
- Save changes and test again

## Deployment Checklist

Before going live:

- [ ] All 9 templates uploaded to Supabase
- [ ] Subject lines updated for each template
- [ ] Sender email set to `noreply@myitutor.com`
- [ ] Sender name set to `iTutor`
- [ ] SMTP provider configured (Resend)
- [ ] Domain verified in SMTP provider
- [ ] SPF record added to DNS
- [ ] DKIM records added to DNS (all 3)
- [ ] DMARC record added to DNS
- [ ] Test email sent and received
- [ ] Buttons work correctly
- [ ] Links go to correct URLs
- [ ] Mail Tester score is 9+ / 10
- [ ] Tested on multiple email clients
- [ ] Support email (support@myitutor.com) is monitored

## Maintenance

### Regular Updates

**Monthly:**
- Check email delivery rates in Resend dashboard
- Monitor bounce rates (<5%)
- Monitor spam complaint rates (<0.1%)

**Quarterly:**
- Review email content for relevance
- Update copyright year if needed
- Test templates on new email clients

**Annually:**
- Refresh design if branding changes
- Update contact information
- Review and optimize content

## Support

For help with these email templates:

**Technical Issues:**
- Check Supabase Auth logs
- Review Resend delivery dashboard
- Test with Mail Tester

**Deliverability Issues:**
- Verify DNS records
- Check domain reputation
- Review spam complaints

**Content Questions:**
- Contact: support@myitutor.com
- Reference this README for customization

## File Structure

```
email-templates/
├── confirm-signup.html           # New user email confirmation
├── invite-user.html              # Team invitation email
├── magic-link.html               # Passwordless sign-in
├── change-email.html             # Email address change confirmation
├── reset-password.html           # Password reset flow
├── reauthentication.html         # Identity verification
├── notify-password-changed.html  # Password change notification
├── notify-email-changed.html     # Email change notification
├── notify-phone-changed.html     # Phone change notification
└── EMAIL_TEMPLATES_README.md     # This file
```

## Version History

- **v1.0** (January 2026) - Initial release
  - 9 email templates created
  - iTutor branding applied
  - Spam-safe design implemented
  - Plain text versions included

---

**Ready to Deploy:** ✅ All templates complete
**Support:** support@myitutor.com
**Last Updated:** January 2026

