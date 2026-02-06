# Fix Browser Notification Permission Issues

## Problem: Browser Didn't Grant Notification Permission

When you log into iTutor, the system automatically requests notification permission. If you accidentally clicked "Block" or "Deny", you won't receive push notifications.

---

## How to Check Current Permission Status

### Chrome / Edge / Brave
1. Open your iTutor website
2. Click the 🔒 lock icon (or ⓘ info icon) in the address bar to the left of the URL
3. Look for "Notifications" in the dropdown
4. Check if it says:
   - ✅ **Allow** - You're good!
   - ❌ **Block** or **Ask** - You need to fix it

### Firefox
1. Open your iTutor website
2. Click the 🔒 lock icon in the address bar
3. Click "Connection secure" → "More information"
4. Go to "Permissions" tab
5. Find "Receive Notifications"

### Safari
1. Open **Safari** → **Settings** (or Preferences)
2. Go to **Websites** tab
3. Click **Notifications** in the left sidebar
4. Find your iTutor website in the list

---

## How to Re-Enable Notifications

### Method 1: Reset Site Settings (Chrome/Edge/Brave)

1. **Open your iTutor website**

2. **Click the lock icon** 🔒 in the address bar

3. **Click "Site settings"**

4. **Find "Notifications"** in the list

5. **Change from "Block" to "Allow"**

6. **Reload the page** (Ctrl+R or Cmd+R)

7. **Verify** by checking the browser console:
   - Press F12 to open DevTools
   - Go to "Console" tab
   - Look for any Firebase messaging logs

### Method 2: Clear Site Permissions and Start Fresh

1. **Open Chrome Settings**: `chrome://settings/content/notifications`

2. **Find your iTutor site** in the "Block" or "Not allowed" list

3. **Click the trash icon** 🗑️ to remove it

4. **Reload your iTutor website**

5. **When prompted**, click "Allow" this time

### Method 3: Manually Grant Permission in Settings

#### Chrome/Edge/Brave
1. Go to `chrome://settings/content/notifications` (or `edge://settings/content/notifications`)
2. Under "Allowed to send notifications", click **Add**
3. Enter your iTutor website URL (e.g., `https://myitutor.com`)
4. Click "Add"
5. Reload your iTutor website

#### Firefox
1. Go to `about:preferences#privacy`
2. Scroll down to "Permissions" → "Notifications" → click "Settings..."
3. Find your iTutor website
4. Change "Status" to "Allow"
5. Click "Save Changes"

#### Safari
1. Safari → Settings → Websites → Notifications
2. Find your iTutor website
3. Change dropdown from "Deny" to "Allow"

---

## How to Test if It's Working

After re-enabling notifications:

1. **Log out and log back in** to your iTutor account

2. **Open browser console** (F12 → Console tab)

3. **Look for success messages**:
   ```
   Firebase token registered successfully
   ```

4. **Check the database**:
   Run this SQL in Supabase:
   ```sql
   SELECT * FROM push_tokens 
   WHERE user_id = 'YOUR_USER_ID' 
   ORDER BY created_at DESC;
   ```
   You should see a token with `platform = 'web'`

5. **Test with an upcoming session**:
   - Create a test session scheduled 10 minutes from now
   - Wait for the notification
   - Check browser notifications (may appear as a desktop notification)

---

## Understanding Push Notification States

### ✅ **Granted** (Working)
- User clicked "Allow"
- Push token is registered in database
- Notifications will be received

### ❌ **Denied** (Not Working)
- User clicked "Block" or "Deny"
- No push token registered
- User must manually re-enable in browser settings

### ⚠️ **Default** (Asking)
- User hasn't been asked yet
- iTutor will automatically prompt on login
- If prompt doesn't appear, permission might be denied

---

## Troubleshooting

### "I clicked Allow but still no notifications"

**Check these:**

1. **Check browser console for errors**:
   - Open DevTools (F12) → Console
   - Look for Firebase or notification errors

2. **Verify service worker is registered**:
   - In DevTools, go to "Application" tab (Chrome) or "Storage" (Firefox)
   - Click "Service Workers"
   - You should see `/firebase-messaging-sw.js` listed as active

3. **Check if push_tokens has your token**:
   ```sql
   SELECT * FROM push_tokens WHERE user_id = 'YOUR_USER_ID';
   ```

4. **Clear browser cache and try again**:
   - Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
   - Clear "Cached images and files"
   - Reload website

### "Notification permission is 'default' but no prompt appears"

This means the browser is blocking the prompt. Possible reasons:
- User previously dismissed/blocked the prompt
- Browser security settings are preventing prompts
- HTTPS is not enabled (notifications require HTTPS)

**Fix**: Manually grant permission using Method 3 above

### "I see the notification but it doesn't make a sound"

Check:
1. **Browser notification settings**: Some browsers have a "Silent" option
2. **System notification settings**: Windows/Mac might have notifications muted
3. **Do Not Disturb mode**: Check if your OS has DND enabled

---

## For Developers: Debugging

### Check if component is mounted
The `PushTokenRegistrar` component should be mounted in `DashboardLayout.tsx`:
```tsx
<PushTokenRegistrar />
```

### Manually trigger permission request
In browser console:
```javascript
Notification.requestPermission().then(permission => {
  console.log('Notification permission:', permission);
});
```

### Check Firebase config
Verify these env variables are set:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

### Test token registration API
```bash
curl -X POST https://myitutor.com/api/push-tokens/register \
  -H "Content-Type: application/json" \
  -d '{"token":"test-token","platform":"web"}'
```
