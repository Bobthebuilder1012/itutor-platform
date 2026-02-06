# Browser Push Notifications Setup Guide

## Overview
This guide explains how to enable browser push notifications for desktop users, in addition to the existing mobile FCM notifications.

## Prerequisites

1. **VAPID Keys** (Web Push authentication)
2. **Service Worker** (Already created: `public/sw.js`)
3. **Push Notification Service** (Already created: `lib/services/browserPushService.ts`)

## Step 1: Generate VAPID Keys

Run this command to generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

You'll get output like:
```
Public Key: BN...xyz
Private Key: abc...123
```

## Step 2: Add Environment Variables

Add to your `.env.local`:

```env
# Web Push (VAPID Keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_SUBJECT=mailto:your-email@example.com
```

## Step 3: Update Database Schema

The `push_tokens` table already supports web push! Just ensure it accepts 'web' as a platform:

```sql
-- Check if 'web' is allowed
SELECT constraint_def FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%push_tokens%platform%';

-- If needed, update the constraint:
ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_platform_check;
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_platform_check 
  CHECK (platform IN ('web', 'android', 'ios'));
```

## Step 4: Create API Endpoint

Create `app/api/push-notifications/subscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, subscription, platform } = await request.json();
    
    const supabase = getServiceClient();
    
    // Store web push subscription
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
        token: JSON.stringify(subscription),
        platform: platform,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,token'
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

## Step 5: Initialize on User Login

In your main layout or dashboard, add:

```typescript
import { initializePushNotifications, requestNotificationPermission } from '@/lib/services/browserPushService';

// In your component
useEffect(() => {
  if (profile?.id) {
    // Request permission and initialize
    requestNotificationPermission().then(granted => {
      if (granted) {
        initializePushNotifications(profile.id);
      }
    });
  }
}, [profile]);
```

## Step 6: Update Edge Function to Send Web Push

The Edge Function needs to detect 'web' platform tokens and send via Web Push API instead of FCM.

Add to `supabase/functions/_shared/webPush.ts`:

```typescript
import webpush from 'npm:web-push@3.6.6';

export async function sendWebPush(params: {
  subscription: PushSubscription;
  title: string;
  body: string;
  data?: Record<string, any>;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}) {
  webpush.setVapidDetails(
    params.vapidSubject,
    params.vapidPublicKey,
    params.vapidPrivateKey
  );

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    data: params.data || {}
  });

  await webpush.sendNotification(params.subscription, payload);
}
```

## Step 7: Test It!

1. Open your app in a browser
2. Grant notification permission when prompted
3. Create a session 10 minutes from now
4. Wait for the Edge Function to run
5. You should receive a browser notification!

## Platform Support

| Platform | Type | Status |
|----------|------|--------|
| Desktop Chrome/Edge | Web Push | ✅ Ready |
| Desktop Firefox | Web Push | ✅ Ready |
| Desktop Safari | Web Push | ⚠️  Requires Safari 16+ |
| Mobile Android (Browser) | Web Push | ✅ Ready |
| Mobile iOS (App) | FCM | ✅ Already Implemented |
| Mobile Android (App) | FCM | ✅ Already Implemented |

## Testing

```sql
-- Check if web push subscriptions are registered
SELECT 
  COUNT(*) as web_push_users,
  COUNT(DISTINCT user_id) as unique_users
FROM push_tokens 
WHERE platform = 'web';
```

## Troubleshooting

- **No permission prompt**: Check browser settings → Site permissions
- **Service worker not registering**: Check browser console for errors
- **Notifications not showing**: Ensure Do Not Disturb is off
- **VAPID errors**: Verify keys are correctly set in environment variables
