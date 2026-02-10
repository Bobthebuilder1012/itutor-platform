# Browser Push Notifications - Final Setup Checklist

## ✅ Already Completed

1. **Frontend Implementation**
   - ✅ Created `lib/services/browserPushService.ts` with subscription logic
   - ✅ Created `public/sw.js` Service Worker for handling push events
   - ✅ Created `app/api/push-notifications/subscribe/route.ts` API endpoint
   - ✅ Created `app/api/push-notifications/unsubscribe/route.ts` API endpoint
   - ✅ Created `components/EnableNotificationsPrompt.tsx` UI component
   - ✅ Integrated auto-initialization in `DashboardLayout.tsx`
   - ✅ Database already supports 'web' platform in `push_tokens` table

2. **Backend Implementation**
   - ✅ Created `supabase/functions/_shared/webPush.ts` utility
   - ✅ Updated `session-reminder-10-min` Edge Function to support both FCM and Web Push

3. **Documentation**
   - ✅ Created comprehensive `BROWSER_PUSH_SETUP.md` guide

## 🔧 Required Configuration (Your Next Steps)

### Step 1: Generate VAPID Keys

Run this command in your terminal (Node.js must be installed):

```bash
npx web-push generate-vapid-keys
```

You'll get output like:
```
=======================================
Public Key:
BJthRQ5Jf... (long string)

Private Key:
a3dKpP9Vf... (long string)
=======================================
```

### Step 2: Add to `.env.local`

Add these variables to your `.env.local` file:

```env
# Web Push (VAPID Keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BJthRQ5Jf... (your public key)
VAPID_PRIVATE_KEY=a3dKpP9Vf... (your private key)
VAPID_SUBJECT=mailto:your-email@myitutor.com
```

**Note:** Replace `your-email@myitutor.com` with a real email for VAPID subject.

### Step 3: Add to Supabase Edge Functions

1. Go to Supabase Dashboard → Edge Functions → Settings
2. Add these **Environment Variables** (same values as above):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

### Step 4: Deploy Edge Function

From your project root, deploy the updated Edge Function:

```bash
supabase functions deploy session-reminder-10-min
```

This ensures the Edge Function has access to the VAPID keys.

### Step 5: Restart Your Dev Server

```bash
# Stop current server (Ctrl+C)
# Then restart
npm run dev
```

### Step 6: Test It!

1. **Open iTutor in a browser** (Chrome, Firefox, or Edge recommended)
2. **Login to your account** (student or tutor)
3. **Look for the notification prompt** at the top of the dashboard (blue banner)
4. **Click "Enable"** and grant notification permission
5. **Check browser console** for confirmation: "Web push subscription successful"
6. **Verify in database:**

```sql
-- Check if your web push subscription was saved
SELECT 
  user_id,
  platform,
  created_at,
  last_used_at
FROM push_tokens
WHERE platform = 'web'
ORDER BY created_at DESC;
```

### Step 7: Test End-to-End

You can trigger a test notification by:
1. Running `PUSH_TEST_ALL_IN_ONE.sql` to create a session 9 minutes from now
2. Waiting for the Edge Function to run (it runs every minute)
3. You should see a browser notification pop up!

## 🔍 Verification Commands

**Check web push subscriptions:**
```sql
SELECT COUNT(*) FROM push_tokens WHERE platform = 'web';
```

**Check Edge Function logs:**
1. Go to Supabase Dashboard → Edge Functions → `session-reminder-10-min`
2. Click "Logs" to see recent executions

**Check browser console:**
- Open DevTools (F12) → Console
- Look for: "Web push subscription successful" or any errors

## 🎯 Expected Behavior

### On Desktop/Laptop:
- User sees blue "Enable Desktop Notifications" banner
- After enabling, notifications work even when browser tab is closed
- Clicking notification opens iTutor and navigates to the relevant page

### On Mobile:
- Mobile app users continue using FCM (already implemented)
- Mobile browser users can also enable web push

## 📊 Platform Support Matrix

| Platform | Type | Status |
|----------|------|--------|
| Desktop Chrome/Edge | Web Push | ✅ Ready |
| Desktop Firefox | Web Push | ✅ Ready |
| Desktop Safari | Web Push | ⚠️  Requires Safari 16+ |
| Mobile Android (Browser) | Web Push | ✅ Ready |
| Mobile iOS (App) | FCM | ✅ Already Working |
| Mobile Android (App) | FCM | ✅ Already Working |

## 🚨 Troubleshooting

**"No prompt showing"**
- Check browser console for errors
- Ensure you're on HTTPS (localhost is OK)
- Try incognito/private window

**"Permission denied"**
- Reset site permissions in browser settings
- Try different browser

**"No notifications received"**
- Check Edge Function logs in Supabase
- Verify VAPID keys are set correctly
- Ensure Edge Function was redeployed after adding env vars

## 📝 What Was Pushed to GitHub

All code has been committed and pushed:
- Commit 1: `Integrate browser push notifications into dashboard - add prompt and auto-init`
- Commit 2: `Update Edge Function to support both FCM and Web Push notifications`
- Commit 3: `Update browser push setup guide with deployment instructions`

You're ready to configure VAPID keys and test!
