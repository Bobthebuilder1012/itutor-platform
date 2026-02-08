# Verification Code Expiry Update

## Change Summary
Updated verification code expiry to **1 hour** for optimal security.

## Why 1 Hour?
- ✅ **Best security**: Industry standard for verification codes (matches Google, GitHub, etc.)
- ✅ **Still user-friendly**: 1 hour is plenty of time for users to verify their email
- ✅ **Reduces attack window**: Minimizes risk of code theft/interception
- ✅ **Encourages prompt action**: Users verify their email immediately

## Files Updated

### 1. Email Templates
- ✅ `SUPABASE_CONFIRM_EMAIL_TEMPLATE.html` - Changed to "1 hour"
- ✅ `app/api/send-verification-email/route.ts` - Changed to "1 hour"

### 2. Configuration Guides
- ✅ `SUPABASE_EMAIL_OTP_SETUP.md` - Set to 3600 seconds (1 hour)
- ✅ `VERIFICATION_CODE_FIX_SUMMARY.md` - Updated all references
- ✅ `VERIFICATION_EMAIL_UPDATE.md` - Updated documentation

## Supabase Configuration Required

When setting up Email OTP in Supabase:

**Recommended Setting** (1 hour):
```
OTP Expiry: 3600 seconds
```

This is the industry standard and default for most authentication services.

### Where to Change:
1. Go to: **Supabase Dashboard** → **Authentication** → **Providers**
2. Find **Email** provider
3. Set **OTP Expiry**: `3600` seconds (1 hour)
4. Save changes

## Time Conversion Reference

For future reference:
- 1 hour = 3600 seconds (current - recommended)
- 6 hours = 21600 seconds
- 12 hours = 43200 seconds
- 24 hours = 86400 seconds

## Email Text

Users will now see:
> Enter this code on the verification page to complete your signup. This code will expire in **1 hour**.

## Testing Checklist

After configuration:
- [ ] Set OTP Expiry to 3600 seconds in Supabase
- [ ] Update email template with new HTML
- [ ] Test signup flow
- [ ] Verify email shows "1 hour"
- [ ] Confirm code expires after 1 hour (if testing expiry)

## Security Best Practices

✅ **1 hour** is the industry standard because:
- **Optimal security**: Minimizes the attack window significantly
- **Good usability**: Users typically verify within minutes, not hours
- **Matches expectations**: Same as Google, GitHub, and other major platforms
- **Encourages action**: Users verify immediately rather than postponing

## Additional Recommendations

Consider also:
- Rate limiting signup attempts (prevent spam)
- Limiting resend code requests (e.g., max 3 per hour)
- Blocking repeated failed verification attempts
- Logging failed verification for security monitoring

---

**Status**: ✅ All files updated with 1-hour expiry (industry standard)
