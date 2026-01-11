# Session Migration Troubleshooting Guide

## Issue: Sessions Not Updating After Switching Video Providers

If you switch from Google Meet to Zoom (or vice versa) and your existing sessions are still showing the old provider's meeting links, follow these steps:

## Quick Fix

### Option 1: Use the "Refresh Future Session Links" Button

1. Go to **Settings > Video Provider** (or `/tutor/video-setup`)
2. Find your currently connected provider (Google Meet or Zoom)
3. Click the **"Refresh Future Session Links"** button
4. Wait for the confirmation message
5. Your future sessions will now have new meeting links

### Option 2: Check the Database Manually

Run this SQL query in your Supabase SQL Editor to check your sessions:

```sql
SELECT 
  id,
  provider,
  join_url,
  scheduled_start_at,
  status
FROM sessions
WHERE tutor_id = 'YOUR_TUTOR_ID'
  AND status IN ('SCHEDULED', 'JOIN_OPEN')
  AND scheduled_start_at >= NOW()
ORDER BY scheduled_start_at ASC;
```

Replace `YOUR_TUTOR_ID` with your actual tutor ID.

## Why This Happens

The automatic migration runs during the OAuth callback when you switch providers. However, migration might fail if:

1. **Network Issues** - The OAuth callback completes but migration fails
2. **API Rate Limits** - Google/Zoom API limits are reached
3. **Invalid Tokens** - Old tokens expired before migration
4. **Browser Navigation** - User navigates away during migration

## How the Migration Works

### Automatic Migration (OAuth Callback)

When you click "Switch to [Provider]":

1. OAuth flow completes
2. New provider connection is saved
3. System detects previous provider was different
4. Automatically triggers migration
5. Redirects with migration results

**Files involved:**
- `app/api/auth/google/callback/route.ts`
- `app/api/auth/zoom/callback/route.ts`
- `lib/services/migrateSessionsToNewProvider.ts`

### Manual Migration (Refresh Button)

When you click "Refresh Future Session Links":

1. Calls `/api/sessions/migrate-provider`
2. Gets current provider from database
3. Finds all future sessions
4. Creates new meeting links
5. Updates session records

**Files involved:**
- `app/api/sessions/migrate-provider/route.ts`
- `lib/services/migrateSessionsToNewProvider.ts`

## What Gets Updated

For each future session (status = SCHEDULED or JOIN_OPEN):

- ✅ `provider` → New provider name
- ✅ `meeting_external_id` → New meeting ID from provider
- ✅ `join_url` → New meeting link
- ✅ `meeting_created_at` → Current timestamp
- ✅ `updated_at` → Current timestamp

## Verification Steps

### 1. Check Provider Connection

```sql
SELECT provider, connection_status, updated_at
FROM tutor_video_provider_connections
WHERE tutor_id = 'YOUR_TUTOR_ID';
```

Should show your new provider (google_meet or zoom).

### 2. Check Session Records

```sql
SELECT id, provider, join_url, updated_at
FROM sessions
WHERE tutor_id = 'YOUR_TUTOR_ID'
  AND scheduled_start_at >= NOW()
  AND status IN ('SCHEDULED', 'JOIN_OPEN');
```

All future sessions should show the new provider and have recent `updated_at` timestamps.

### 3. Test Join Button

1. Go to Sessions page as student
2. Find a future session
3. Check that it shows the correct provider name
4. Click "Join" when available
5. Verify it opens the correct platform (Google Meet or Zoom)

## Console Logs to Check

### Browser Console (Tutor)

When clicking "Refresh Future Session Links", you should see:
```
🔄 Manual migration triggered for tutor [ID] to [provider]
```

### Server Logs (Terminal)

During migration, you should see:
```
🔄 Starting session migration for tutor [ID] to [provider]
📋 Found X future sessions to migrate
🔄 Migrating session [ID]...
✅ Successfully migrated session [ID] to [provider]
✅ Migration complete. Migrated X/X sessions to [provider]
```

## Common Errors

### "No video provider connected"
**Cause:** The provider connection wasn't saved properly.
**Fix:** Re-connect your video provider.

### "Failed to create meeting"
**Cause:** Invalid OAuth tokens or API issues.
**Fix:** 
1. Switch to the other provider
2. Switch back
3. Try migration again

### "Some sessions failed to migrate"
**Cause:** Individual sessions had errors (e.g., invalid booking data).
**Fix:** Check which sessions failed in console logs and manually update them.

## Manual Fix (Last Resort)

If automatic migration keeps failing, you can manually update sessions:

```sql
-- Check current sessions
SELECT id, provider, join_url FROM sessions
WHERE tutor_id = 'YOUR_TUTOR_ID'
  AND scheduled_start_at >= NOW()
  AND status IN ('SCHEDULED', 'JOIN_OPEN');

-- ⚠️ WARNING: Only run this if you understand what it does
-- This will update the provider field, but you'll need to manually
-- create new meeting links through your video provider's dashboard
UPDATE sessions
SET 
  provider = 'zoom',  -- or 'google_meet'
  updated_at = NOW()
WHERE tutor_id = 'YOUR_TUTOR_ID'
  AND scheduled_start_at >= NOW()
  AND status IN ('SCHEDULED', 'JOIN_OPEN');
```

## Testing the Fix

After running migration:

1. **As Tutor:**
   - Go to Sessions page
   - Check that future sessions show correct provider
   - Verify join URLs are updated

2. **As Student:**
   - Go to Sessions page
   - Find a session with the tutor
   - Check that provider name is correct
   - Click join when available
   - Verify correct platform opens

## Prevention

To avoid this issue in the future:

1. ✅ Wait for migration confirmation message after switching
2. ✅ Don't close browser during provider switch
3. ✅ Use "Refresh Future Session Links" button after switching
4. ✅ Test with a student account before actual sessions

## Still Having Issues?

If sessions are still not updating:

1. Clear browser cache (Ctrl+Shift+Delete)
2. Log out and log back in
3. Try migration from a different browser
4. Check Supabase logs for errors
5. Contact support with:
   - Your tutor ID
   - Provider you switched to
   - Number of sessions affected
   - Console error messages












