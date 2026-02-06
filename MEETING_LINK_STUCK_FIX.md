# Meeting Link Stuck - Fix Documentation

## Problem

Sessions showing "Meeting link is being generated..." message indefinitely. This occurs when:

1. A booking is confirmed and a session is created in the database
2. The system tries to create a Google Meet or Zoom meeting via their API
3. The API call fails (usually due to expired OAuth tokens or API errors)
4. The session is saved without a `join_url`, leaving it in a "stuck" state

## Root Causes

- **Expired OAuth tokens**: Google/Zoom access tokens expire and need refreshing
- **Failed token refresh**: The refresh token might be invalid or expired
- **API errors**: Google Calendar or Zoom API might return errors
- **Connection issues**: Network problems during API calls

## Solution Implemented

### 1. Diagnostic SQL Script (`FIX_STUCK_MEETING_LINKS.sql`)

Run this in Supabase SQL Editor to identify stuck sessions:

```sql
-- Finds all sessions missing join_url
-- Shows tutor video connection status
-- Identifies expired tokens
```

### 2. Retry API Endpoint (`/api/sessions/retry-meeting-link`)

New API endpoint that:
- Accepts a `sessionId`
- Attempts to create the meeting again
- Updates the session with the meeting link
- Returns detailed error messages if it fails

### 3. UI Improvements

#### Tutor Session Detail Page
- Added "Retry Now" button when meeting link is stuck
- Shows helpful error messages
- Automatically reloads session data after successful retry

#### SessionJoinButton Component
- Added inline "Retry" button (tutors only)
- Automatic refresh after successful retry
- Better user feedback during retry process

## How to Fix Stuck Sessions

### For Tutors (Via UI)
1. Navigate to the stuck session in "My Sessions"
2. Click the "Retry Now" button in the yellow warning box
3. If it fails, check your video provider connection in Settings

### For Admins (Via SQL)
1. Run `FIX_STUCK_MEETING_LINKS.sql` to identify affected sessions
2. Check if tutor's video connection is valid
3. If token is expired, tutor needs to reconnect their video provider
4. Use the Retry button in the UI or manually trigger meeting creation

### For Developers (Via API)
```bash
curl -X POST http://localhost:3000/api/sessions/retry-meeting-link \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "YOUR_SESSION_ID"}'
```

## Prevention

The system already has automatic token refresh built-in:
- When Google/Zoom tokens expire, the system automatically refreshes them
- The meeting creation retry happens once automatically
- If both attempts fail, the session is saved without a meeting link

To prevent this issue:
1. Ensure tutors reconnect their video providers before tokens expire
2. Monitor the `token_expires_at` field in `tutor_video_provider_connections`
3. Consider implementing a cron job to proactively refresh expiring tokens
4. Consider implementing a background job to retry stuck sessions automatically

## Files Modified

- `app/api/sessions/retry-meeting-link/route.ts` - New retry API endpoint
- `app/tutor/sessions/[sessionId]/page.tsx` - Added retry functionality
- `components/sessions/SessionJoinButton.tsx` - Added retry button
- `FIX_STUCK_MEETING_LINKS.sql` - Diagnostic queries

## Testing

1. Create a session with an expired video provider token
2. Verify "Meeting link is being generated..." appears
3. Click "Retry Now"
4. Verify error message if token is invalid
5. Reconnect video provider
6. Click "Retry Now" again
7. Verify meeting link appears successfully
