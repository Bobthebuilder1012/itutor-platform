# OAuth Environment Variables - Configuration Guide

## Current Status
Environment variables have been configured with new client secret. This deployment will activate the updated credentials.

## Required Environment Variables

### Google OAuth (for Google Meet)
Add these to your hosting platform's environment variables:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=https://myitutor.com/api/auth/google/callback
```

**Status from diagnostics:**
- ✅ `GOOGLE_CLIENT_ID` - **Already set**
- ❌ `GOOGLE_REDIRECT_URI` - **MISSING** (confirmed by error response)
- ❓ `GOOGLE_CLIENT_SECRET` - Unknown (not checked yet)

### Zoom OAuth (for Zoom)
Add these to your hosting platform's environment variables:

```bash
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret
ZOOM_REDIRECT_URI=https://myitutor.com/api/auth/zoom/callback
```

**Status:**
- ❓ All three need to be verified (test after deployment)

## How to Add Environment Variables

### If using Vercel:
1. Go to https://vercel.com
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - Key: `GOOGLE_REDIRECT_URI`
   - Value: `https://myitutor.com/api/auth/google/callback`
   - Environment: Production (check the box)
5. Click **Save**
6. Redeploy your application (Vercel usually auto-redeploys)

### If using Railway:
1. Go to https://railway.app
2. Select your project
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add each variable with its value
6. Click **Deploy** to restart with new variables

### If using Netlify:
1. Go to https://app.netlify.com
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Add each variable
6. Trigger a new deploy from **Deploys** tab

## After Adding Environment Variables

### 1. Update Google Cloud Console
Ensure the redirect URI is registered:
1. Go to https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", verify this EXACT URI is listed:
   ```
   https://myitutor.com/api/auth/google/callback
   ```
4. If not listed, add it and click **SAVE**

### 2. Update Zoom Marketplace
Ensure the redirect URI is registered:
1. Go to https://marketplace.zoom.us/develop/apps
2. Click your app
3. Go to **OAuth** section
4. Under "Redirect URL for OAuth", verify this EXACT URI is listed:
   ```
   https://myitutor.com/api/auth/zoom/callback
   ```
5. If not listed, add it and click **Save**

## Verification

After adding the variables and redeploying:

### Test Google Meet Connection:
1. Log in as a tutor
2. Go to Settings → Video Provider
3. Click "Connect Google Meet"
4. You should now see the Google OAuth consent screen (instead of an error)

### Test Zoom Connection:
1. Log in as a tutor
2. Go to Settings → Video Provider
3. Click "Connect Zoom"
4. You should now see the Zoom OAuth consent screen (instead of an error)

## Debug Endpoints
I've created debug endpoints to help verify configuration:

- **Google**: https://myitutor.com/api/auth/google/debug
- **Zoom**: https://myitutor.com/api/auth/zoom/debug

Access these while logged in as a tutor to see which variables are set/missing.

## Common Mistakes to Avoid

❌ **Trailing slash**: `https://myitutor.com/api/auth/google/callback/` (wrong)  
✅ **No trailing slash**: `https://myitutor.com/api/auth/google/callback` (correct)

❌ **Wrong protocol**: `http://myitutor.com/...` (wrong for production)  
✅ **HTTPS**: `https://myitutor.com/...` (correct for production)

❌ **WWW mismatch**: If your site uses `www.myitutor.com`, use that in the redirect URI  
✅ **Match your domain exactly**: Use the exact domain your site uses

## Next Steps

1. ✅ Add missing environment variables to your hosting platform
2. ✅ Verify redirect URIs in Google Cloud Console and Zoom Marketplace
3. ✅ Redeploy your application
4. ✅ Test both Google Meet and Zoom connections
5. ✅ Report back if you encounter any errors

Once you've added the environment variables and redeployed, test the connections and let me know the results!

