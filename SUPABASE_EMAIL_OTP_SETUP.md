# Supabase Email OTP Configuration

## Quick Setup Guide

### Step 1: Enable Email OTP in Supabase

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard
   - Select your iTutor project

2. **Navigate to Authentication Settings**
   - Click **Authentication** in the left sidebar
   - Click **Providers** tab
   - Find **Email** provider

3. **Configure Email OTP Settings**
   ```
   ✅ Enable Email provider: ON
   ✅ Enable Email OTP: ON (IMPORTANT - this enables verification codes)
   ✅ OTP Expiry: 3600 seconds (1 hour)
   ✅ OTP Length: 8 digits (to match your verification page)
   ```

4. **Save Changes**

### Step 2: Update Email Template

1. **Go to Email Templates**
   - Settings → Auth → Email Templates
   - Find "Confirm signup" template

2. **Replace the template**
   - Copy content from `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html`
   - Paste into Supabase
   - Save

### Step 3: Update Your Signup Code

Make sure your signup code uses OTP instead of magic links:

**Instead of** (magic link):
```typescript
const { error } = await supabase.auth.signUp({
  email: email,
  password: password,
})
```

**Use** (email OTP):
```typescript
const { error } = await supabase.auth.signUp({
  email: email,
  password: password,
  options: {
    emailRedirectTo: undefined, // Don't redirect, use OTP verification
  }
})
```

### Step 4: Verify OTP on Your Page

When user enters the code:
```typescript
const { error } = await supabase.auth.verifyOtp({
  email: email,
  token: code, // The 8-digit code from the email
  type: 'signup'
})
```

## How It Works

### Email Flow:
1. User signs up → Supabase generates 8-digit code
2. Supabase sends email with code using your template
3. User enters code on your verification page
4. Your app calls `verifyOtp()` to confirm
5. User is verified and logged in

### Template Variables:
- `{{ .Token }}` - The 8-digit verification code
- This is automatically replaced by Supabase

## Testing

1. **Sign up with a test email**
2. **Check email** - should show verification code like: `12345678`
3. **Enter code** on verification page
4. **Verify** it accepts the code

## Troubleshooting

### Code not showing in email:
- Check if Email OTP is enabled in Authentication → Providers
- Verify the template uses `{{ .Token }}` not `{{ .ConfirmationURL }}`
- Make sure you're calling signup without `emailRedirectTo`

### Code is wrong length:
- In Authentication → Providers → Email
- Set OTP Length to 8 digits (not 6)

### Email shows {{ .Token }} as text:
- This means Supabase thinks it's a magic link email, not OTP
- Enable Email OTP in Authentication → Providers
- Make sure signup doesn't include `emailRedirectTo` parameter

### Code expired:
- Recommended expiry is 1 hour (3600 seconds)
- This is the default setting in Authentication → Providers → Email

## Configuration Checklist

Before testing:
- [ ] Email OTP is enabled in Supabase
- [ ] OTP Length is set to 8 digits
- [ ] OTP Expiry is set to 3600 seconds (1 hour)
- [ ] Email template updated with code box design
- [ ] Signup code doesn't include `emailRedirectTo`
- [ ] Verification page calls `verifyOtp()` with the code

## Screenshots of Settings

### Where to find Email OTP setting:
```
Supabase Dashboard
└── Authentication
    └── Providers
        └── Email
            ├── ✅ Enable Email provider
            ├── ✅ Enable Email OTP (← IMPORTANT!)
            ├── OTP Length: 8
            └── OTP Expiry: 3600
```

## Additional Resources

- Supabase Email OTP Docs: https://supabase.com/docs/guides/auth/auth-email-otp
- Supabase Email Templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Verification code best practices: Use 6-8 digit codes, 1-hour expiry for security

---

**Note**: Once Email OTP is enabled, users will receive verification codes instead of magic links for signup confirmation. Make sure your verification page is ready to accept and verify these codes!
