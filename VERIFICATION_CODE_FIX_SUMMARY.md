# Email Verification Code Fix

## ✅ Problem Fixed
The Supabase confirmation email was showing a button/link, but your verification page expects an 8-digit CODE.

## 🔧 Changes Made

### 1. Updated Email Template
**File**: `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html`

**Before**:
```html
<a href="{{ .ConfirmationURL }}" class="button">
  Confirm Your Email
</a>
```

**After**:
```html
<div style="background: green gradient; padding: 30px;">
  <p>YOUR VERIFICATION CODE</p>
  <p style="font-size: 42px;">{{ .Token }}</p>
</div>
```

### 2. Updated Setup Guide
**File**: `SUPABASE_EMAIL_TEMPLATES_GUIDE.md`
- Added instructions to enable Email OTP in Supabase
- Explained the `{{ .Token }}` variable
- Added troubleshooting for code display issues

### 3. Created OTP Configuration Guide
**File**: `SUPABASE_EMAIL_OTP_SETUP.md`
- Complete setup instructions for Email OTP
- Code examples for signup and verification
- Configuration checklist
- Troubleshooting guide

## 📋 What You Need to Do

### Step 1: Enable Email OTP in Supabase (CRITICAL!)
1. Go to: **Supabase Dashboard** → **Authentication** → **Providers**
2. Find **Email** provider
3. Enable these settings:
   - ✅ **Enable Email provider**: ON
   - ✅ **Enable Email OTP**: ON (this is the key setting!)
   - ✅ **OTP Length**: 8 digits
   - ✅ **OTP Expiry**: 3600 seconds (1 hour)
4. **Save changes**

### Step 2: Update Email Template
1. Go to: **Settings** → **Auth** → **Email Templates**
2. Find **"Confirm signup"** template
3. Copy ALL content from `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html`
4. Paste into Supabase
5. **Save**

### Step 3: Test
1. Sign up with a test email
2. Check email - should show 8-digit code like: `12345678`
3. Enter code on verification page
4. Verify it works!

## 🎨 New Email Design

The confirmation email now shows:
- ✅ iTutor logo in black header
- ✅ "Verify Your Email" title
- ✅ **Large verification code in green box** (8 digits, easy to read)
- ✅ Code expiry notice (1 hour)
- ✅ Social media links in footer
- ✅ Updated copyright

Example:
```
┌─────────────────────────────┐
│   [iTutor Logo]             │
├─────────────────────────────┤
│ Verify Your Email           │
│                             │
│ Thank you for signing up!   │
│                             │
│ ┌─────────────────────────┐ │
│ │ YOUR VERIFICATION CODE  │ │
│ │                         │ │
│ │      12345678          │ │
│ └─────────────────────────┘ │
│                             │
│ Enter this code to verify   │
│ Expires in 1 hour           │
├─────────────────────────────┤
│ [Social Links] [Footer]     │
└─────────────────────────────┘
```

## 🔍 How the {{ .Token }} Variable Works

When you enable **Email OTP** in Supabase:
- Supabase generates an 8-digit code (e.g., 66073996)
- The `{{ .Token }}` variable in your email template is replaced with this code
- User receives email with the actual code
- User enters code on your verification page
- Your app calls `supabase.auth.verifyOtp()` to confirm

## ⚠️ Important Notes

### Email OTP vs Magic Link
- **Magic Link** (old way): User clicks button → automatically logged in
- **Email OTP** (new way): User enters code → manually verified

### Make Sure:
1. ✅ Email OTP is **enabled** in Supabase Authentication settings
2. ✅ OTP length is set to **8 digits** (not 6)
3. ✅ Template uses `{{ .Token }}` (not `{{ .ConfirmationURL }}`)
4. ✅ Your signup code doesn't include `emailRedirectTo` parameter

## 📚 Documentation Files

Quick reference for setup:
- `SUPABASE_EMAIL_OTP_SETUP.md` - Complete OTP configuration guide
- `SUPABASE_EMAIL_TEMPLATES_GUIDE.md` - Template update instructions
- `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html` - The actual template to paste

## ✨ Result

After setup:
- ✅ Users receive **8-digit verification code** in email
- ✅ Code matches what your verification page expects
- ✅ Branded email design matching other iTutor emails
- ✅ 1-hour code expiry (secure and industry standard)
- ✅ Professional appearance

---

**Next**: Follow `SUPABASE_EMAIL_OTP_SETUP.md` to configure Supabase!
