# Fix: Google Meet Token Decryption Error

## Problem
Meeting links can't be generated because stored OAuth tokens can't be decrypted.

**Error:** `error:1C800064:Provider routines::bad decrypt`

## Root Cause
The `TOKEN_ENCRYPTION_KEY` environment variable is either:
1. Not set in your `.env.local` file
2. Changed after tokens were encrypted
3. Different between when tokens were saved vs. now

## Solution

### Option A: Set/Fix the Encryption Key (Recommended)

1. **Check your `.env.local` file** - look for `TOKEN_ENCRYPTION_KEY`

2. **If missing**, add it:
   ```bash
   TOKEN_ENCRYPTION_KEY=your-secret-key-here-at-least-32-characters-long
   ```
   
   Generate a secure key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **If it exists but tokens still fail**: The key changed. You need to **reconnect Google Meet**:
   - Go to Settings → Video Provider
   - Disconnect Google Meet
   - Reconnect Google Meet (this will re-encrypt tokens with current key)

4. **Restart your dev server** to pick up the new environment variable

### Option B: Reconnect All Tutors' Google Meet

If you changed the encryption key, ALL tutors need to reconnect:

1. As each tutor, go to Settings → Video Provider
2. Click "Disconnect" (if connected)
3. Click "Connect Google Meet"
4. Complete OAuth flow

This re-encrypts their tokens with the current key.

### Option C: Database Fix (Quick Fix for Testing)

If you just want to test quickly, you can reset the video provider connections:

```sql
-- WARNING: This disconnects ALL tutors - they'll need to reconnect
DELETE FROM tutor_video_provider_connections;
```

Then reconnect as the tutor.

## Verify the Fix

After setting the encryption key and reconnecting:
1. Navigate to a confirmed booking
2. The "Meeting link is being generated..." should disappear
3. The Google Meet link should appear within seconds

## Prevention

Always set `TOKEN_ENCRYPTION_KEY` in your `.env.local` and **never change it** once you have users with connected video providers. If you must change it, all users need to reconnect.
