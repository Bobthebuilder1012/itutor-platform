# 🔍 Email Confirmation Troubleshooting Guide

## Issue: Users redirected to landing page instead of login after email confirmation

## Root Cause Check

### 1. ⚠️ **CRITICAL: Check Supabase Redirect URL Configuration**

The most common cause is that Supabase doesn't have your callback URL configured.

**Steps:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Check these settings:

#### **Site URL:**
- For local development: `http://localhost:3000`
- For production: `https://myitutor.com`

#### **Redirect URLs (MUST include all of these):**
```
http://localhost:3000/auth/callback
http://localhost:3000/**
https://myitutor.com/auth/callback
https://myitutor.com/**
https://*.vercel.app/auth/callback
https://*.vercel.app/**
```

**⚠️ If these aren't configured, email confirmation links will redirect to Site URL (/) instead of /auth/callback!**

---

### 2. Check Email Template Configuration

**Steps:**
1. In Supabase Dashboard → **Authentication** → **Email Templates**
2. Select **"Confirm signup"** template
3. Check the button/link in the template

**The confirmation link should be:**
```html
<a href="{{ .ConfirmationURL }}">Confirm Your Email</a>
```

**NOT:**
```html
<a href="{{ .SiteURL }}">Confirm Your Email</a>
```

---

### 3. Test the Callback Route Directly

Open this URL in your browser (replace with actual values):
```
http://localhost:3000/auth/callback?code=test123&type=signup
```

**Expected Result:**
- Should redirect to `/login?error=oauth_failed` (because test code is invalid)
- Should NOT redirect to landing page

**If it redirects to landing page:**
- There's a middleware or routing issue

---

### 4. Check Browser Console Logs

When you click the email confirmation link:

1. Open Browser DevTools (F12)
2. Go to **Console** tab
3. Click the confirmation link
4. Look for logs starting with:
   - `🔐 Auth callback`
   - `✅ Session established`
   - `➡️ Redirecting to...`

**If you don't see these logs:**
- The callback route isn't being hit
- Check Supabase redirect URL configuration (Step 1)

---

## Quick Fix Options

### Option A: Temporarily Disable Email Confirmation (Testing Only)

1. Supabase Dashboard → **Authentication** → **Settings** → **Email Auth**
2. Find **"Enable email confirmations"**
3. Toggle it **OFF**
4. Try signing up again (will work immediately without email)
5. ⚠️ **Turn back ON before production!**

### Option B: Manual Email Confirmation

If a user is stuck, you can manually confirm their email:

```sql
-- Run in Supabase SQL Editor
UPDATE auth.users
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email = 'user@example.com';
```

Then user can log in immediately.

---

## Diagnostic Test

Create a new test user and watch the flow:

1. **Sign up:** `http://localhost:3000/signup`
   - Use email: `test-$(date +%s)@test.com`
   - Should redirect to: `http://localhost:3000/login?emailSent=true&email=...`

2. **Check Email Confirmation Link:**
   - The link should look like: `http://localhost:3000/auth/callback?code=...&type=signup`
   - **NOT:** `http://localhost:3000/?code=...`

3. **Click Confirmation Link:**
   - Should redirect to: `http://localhost:3000/login?confirmed=true&email=...`
   - Should see green "✅ Email Confirmed!" banner
   - **NOT:** Landing page

---

## Still Not Working?

Run this command to check your environment:

```bash
# Check if environment variables are set
echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Check your `.env.local` file has:
```env
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
```

---

## Next Steps

1. ✅ **First:** Check Supabase Redirect URLs (Step 1 above)
2. ✅ **Then:** Test with a new signup
3. ✅ **Report:** What URL you see in the email confirmation link
