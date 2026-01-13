# Google Meet 400 Error Fix

## Problem
Tutors getting a 400 error ("The server cannot process the request because it is malformed") when trying to connect Google Meet.

## Most Common Causes

### 1. **Redirect URI Mismatch** (Most Likely)
The `GOOGLE_REDIRECT_URI` environment variable must EXACTLY match what's configured in Google Cloud Console.

#### Check Your Google Cloud Console:
1. Go to https://console.cloud.google.com/apis/credentials
2. Click on your OAuth 2.0 Client ID
3. Look at "Authorized redirect URIs"

#### Expected Redirect URI Format:
- **Production**: `https://yourdomain.com/api/auth/google/callback`
- **Development**: `http://localhost:3000/api/auth/google/callback`

#### Common Mistakes:
- ❌ `https://yourdomain.com/api/auth/google/callback/` (trailing slash)
- ❌ `http://yourdomain.com/api/auth/google/callback` (http instead of https for production)
- ❌ Missing the `/api/auth/google/callback` path entirely
- ❌ Using `www.yourdomain.com` when registered without www (or vice versa)

### 2. Missing Environment Variables
Ensure these are set in your production environment (Vercel, Railway, etc.):

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
```

### 3. Incorrect Scopes
The scopes being requested are:
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/userinfo.email`

Make sure these are enabled in Google Cloud Console under "OAuth consent screen" > "Scopes".

## How to Fix

### Step 1: Verify Environment Variables
Log in to your hosting platform and check that all three variables are set correctly.

### Step 2: Update Google Cloud Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add/verify:
   ```
   https://your-production-domain.com/api/auth/google/callback
   http://localhost:3000/api/auth/google/callback
   ```
   (Replace `your-production-domain.com` with your actual domain)

### Step 3: Verify Scopes
1. Go to OAuth consent screen
2. Click "EDIT APP"
3. Click "ADD OR REMOVE SCOPES"
4. Ensure these scopes are added:
   - `.../auth/calendar.events`
   - `.../auth/userinfo.email`

### Step 4: Test Again
After making changes in Google Cloud Console, wait 1-2 minutes for changes to propagate, then try connecting Google Meet again.

## Debugging Tips

If still getting 400 error:

1. **Check Browser Console** - Look for the actual OAuth URL being generated
2. **Check Server Logs** - Look for any console.error messages in your hosting platform logs
3. **Verify Client ID** - Make sure GOOGLE_CLIENT_ID matches the one in Google Cloud Console
4. **Check Domain Verification** - In Google Cloud Console, ensure your domain is verified under "OAuth consent screen"

## Updated Code with Better Error Handling

I've added better error logging to help diagnose the issue.


