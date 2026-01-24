# 🎯 Code-Based Email Verification Setup Guide

## Overview

We've completely overhauled the email verification system from link-based to **code-based verification**. Users now receive a 6-digit code in their email and enter it on a verification page.

### ✅ Benefits:
- **Works better with organization emails** - No link stripping issues
- **More reliable** - Codes can be copied even if formatting breaks
- **Modern UX** - Like how Google, Microsoft, and other major platforms work
- **No link expiration issues** - Simpler for users to understand
- **Still includes backup link** - For users who prefer clicking

---

## Step 1: Enable Email OTP in Supabase

### A. Go to Auth Settings
1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/nfkrfciozjxrodkusrhh
2. Click **Authentication** in the left sidebar
3. Click **Providers**
4. Find **Email** provider

### B. Enable Email OTP
1. Make sure **"Enable Email provider"** is ON
2. Scroll down to **"Email OTP"** section
3. Toggle **"Enable Email OTP"** to ON
4. Click **Save**

---

## Step 2: Update Email Template

### A. Navigate to Email Templates
1. In Supabase Dashboard → **Authentication** → **Email Templates**
2. Select **"Confirm signup"** template

### B. Clear and Paste New Template
1. **Delete everything** currently in the Body field
2. Open the file: `SUPABASE_EMAIL_TEMPLATE_CODE_BASED.html`
3. **Copy the ENTIRE contents** of that file
4. **Paste it** into the Supabase email template Body field
5. Click **"Save"**

### C. What the New Template Includes:
✅ Beautiful iTutor branding with gradient header
✅ Prominent 6-digit code in a green gradient box
✅ Organization email delay warning (yellow box)
✅ Backup link option for users who prefer clicking
✅ Professional footer with support email
✅ Mobile-responsive design

---

## Step 3: Test the System

### Test Flow:
1. **Sign up** with a test email (personal email recommended for first test)
2. Check your inbox - you should receive:
   - Beautiful branded email
   - Large 6-digit code (like **453895**)
   - Organization email warning
   - Backup link
3. You'll be **automatically redirected** to `/verify-code?email=your@email.com`
4. **Enter the 6-digit code** from the email
5. Click **"Verify Email"**
6. Should see success message and redirect to login

### Test Edge Cases:
- ✅ Wrong code → Should show error
- ✅ Expired code (24 hours) → Should show error with resend option
- ✅ Resend code button → Should have 60-second cooldown
- ✅ Organization email → Should still work, just might take longer

---

## Step 4: Update Site URL (If Using Production)

If you're deploying to production:

1. In Supabase Dashboard → **Authentication** → **URL Configuration**
2. Update **Site URL** to your production domain
3. Add your production domain to **Redirect URLs**

Example:
- Site URL: `https://itutor.com`
- Redirect URLs: `https://itutor.com/verify-code`, `https://itutor.com/login`

---

## What Was Changed in the Code

### New Files Created:
1. **`app/verify-code/page.tsx`** - New verification page where users enter the code
   - Beautiful UI with large code input field
   - Real-time validation (6-digits only)
   - Resend code functionality with cooldown
   - Organization email warning
   - Error handling

2. **`SUPABASE_EMAIL_TEMPLATE_CODE_BASED.html`** - New email template
   - Modern, branded design
   - Prominent code display
   - Organization email notice
   - Backup link option

3. **`CODE_VERIFICATION_SETUP_GUIDE.md`** - This guide

### Files Modified:
1. **`app/signup/page.tsx`**
   - Changed redirect from `/login?emailSent=true` to `/verify-code?email=...`

2. **`app/login/page.tsx`**
   - Unverified email errors now redirect to `/verify-code` instead of `/verify-email`
   - Updated help link text from "Resend verification" to "Enter verification code"

### Files Now Deprecated (Can Delete Later):
- `app/verify-email/page.tsx` - Old resend email page (replaced by verify-code)
- `EMAIL_TEMPLATE_UPDATES.md` - Old link-based instructions

---

## User Flow Comparison

### Old Flow (Link-Based):
```
1. User signs up
2. Email sent with confirmation link
3. User clicks link (may break with organization emails)
4. Redirected to /auth/callback
5. Complex redirect logic to /login
❌ Issues: Links stripped, complex redirects, organization email problems
```

### New Flow (Code-Based):
```
1. User signs up
2. Email sent with 6-digit code
3. User auto-redirected to /verify-code
4. User enters code from email
5. Supabase verifies code
6. Success! Redirect to login
✅ Benefits: Simple, reliable, works with all email providers
```

---

## Troubleshooting

### "Code is invalid or expired"
- Code is valid for 24 hours
- Check that user entered code exactly as shown
- Click "Resend Code" to get a new one

### "Email not arriving"
- Organization emails may take 5-30 minutes (as warned in email)
- Check spam/junk folder
- Try "Resend Code" button (60-second cooldown)
- Verify Supabase email settings are correct

### "Template not showing correctly"
- Make sure you copied the ENTIRE HTML file contents
- Don't add any markdown or extra text
- Click "Preview" in Supabase to see how it looks

---

## Next Steps

After setup is complete:

1. ✅ Test with multiple email providers (Gmail, Outlook, organization email)
2. ✅ Verify mobile email rendering looks good
3. ✅ Test resend functionality
4. ✅ Update your support documentation with new flow
5. ✅ (Optional) Delete old verify-email page if you don't need it

---

## Support

If users have issues:
- Point them to `/verify-code` page directly
- They can always click "Resend Code"
- Backup link in email works as fallback
- Manual verification system still available via support requests table

