# Fix Sessions System - Complete Guide

## Problems Fixed

1. ✅ **406 errors** - Added RLS policies for sessions table
2. ✅ **Sessions not being created** - Already implemented in booking confirmation flow
3. ✅ **"View Session & Join" button split** - Now two separate buttons on both student and tutor sides
4. ✅ **Join button timing** - Only shows 5 minutes before session start

## Step-by-Step Fix Instructions

### Step 1: Run RLS Policies SQL

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your iTutor project
   - Click **SQL Editor** in left sidebar
   - Click **+ New query**

2. **Copy and Run SQL**
   - Open the file `FIX_SESSIONS_RLS.sql`
   - Copy ALL contents
   - Paste into SQL editor
   - Click **RUN** (or Ctrl+Enter / Cmd+Enter)

3. **Verify Success**
   You should see output showing 4 policies created:
   ```
   Students can view their own sessions
   Tutors can view their own sessions
   Tutors can update their own sessions
   Service role has full access to sessions
   ```

### Step 2: Restart Dev Server

**Important:** Restart your dev server to load the updated components.

```bash
# Stop the server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

### Step 3: Test the Complete Flow

#### Test Session Creation

1. **As Tutor:**
   - Go to `/tutor/bookings`
   - Find a PENDING booking
   - Click to open booking details
   - Click **"Confirm Booking"**
   - Watch terminal logs - should see session creation

2. **Verify in Database:**
   - Go to Supabase Dashboard → Table Editor
   - Open `sessions` table
   - Should see new row with:
     - `booking_id` matching your confirmed booking
     - `join_url` populated
     - `status` = 'SCHEDULED'
     - `provider` = 'google_meet' or 'zoom'

#### Test Student Sessions List

1. **As Student:**
   - Go to `/student/sessions`
   - Click **"Upcoming"** tab
   - Find your confirmed session

2. **Check Buttons:**
   - Should see **3 buttons:**
     - "Chat with Tutor" (blue)
     - "View Session" (gray)
     - "Join" (green) - **Only if session starts in less than 5 minutes**

3. **Test View Session:**
   - Click "View Session"
   - Should navigate to booking detail page
   - Should see session info and join button (if within 5 min)

4. **Test Join (if within 5 min):**
   - Click "Join" button
   - Should open Google Meet or Zoom in new tab

#### Test Tutor Sessions List

1. **As Tutor:**
   - Go to `/tutor/sessions`
   - Should see table of all sessions

2. **Check Actions Column:**
   - Should see **2 buttons per session:**
     - "View" (gray)
     - "Join" (green) - **Only if session starts in less than 5 minutes**

3. **Test View:**
   - Click "View"
   - Should go to booking detail page
   - Should see SessionJoinButton and MarkNoShowButton components

4. **Test Join (if within 5 min):**
   - Click "Join" button
   - Should open meeting URL in new tab

## What Changed

### Files Modified

1. **`app/student/sessions/page.tsx`**
   - Added session data fetching
   - Split "View Session & Join" into two buttons
   - "Join" button only shows when within 5 minutes of start

2. **`app/tutor/sessions/page.tsx`**
   - Split "View Details" button
   - Added separate "Join" button
   - Join button only shows when within 5 minutes of start

3. **`FIX_SESSIONS_RLS.sql`** (NEW)
   - RLS policies for sessions table
   - Allows students/tutors to view their own sessions
   - Allows tutors to update (for marking no-show)
   - Allows service role full access

### Files Already Working Correctly

- ✅ `app/student/bookings/[bookingId]/page.tsx` - Already has SessionJoinButton
- ✅ `app/tutor/bookings/[bookingId]/page.tsx` - Already calls session creation API and shows join/no-show buttons
- ✅ `app/api/sessions/create-for-booking/route.ts` - Session creation API
- ✅ `lib/services/sessionService.ts` - Session business logic
- ✅ `lib/services/videoProviders.ts` - Google Meet/Zoom integration
- ✅ `components/sessions/SessionJoinButton.tsx` - Join button component
- ✅ `components/sessions/MarkNoShowButton.tsx` - No-show button component

## Troubleshooting

### Still Getting 406 Errors?

- Make sure you ran the `FIX_SESSIONS_RLS.sql` script
- Refresh your browser (Ctrl+Shift+R)
- Check browser console for exact error

### Sessions Not Being Created?

1. **Check Terminal Logs:**
   Look for errors when confirming booking

2. **Check Video Provider:**
   - Go to `/tutor/video-setup`
   - Make sure Google Meet or Zoom is connected
   - If showing "Not Connected", reconnect

3. **Check Environment Variables:**
   Verify in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ZOOM_CLIENT_ID=...
   ZOOM_CLIENT_SECRET=...
   TOKEN_ENCRYPTION_KEY=...
   ```

### Join Button Not Showing?

The join button ONLY shows when:
- ✅ Session has a `join_url` in database
- ✅ Current time is within 5 minutes of `scheduled_start_at`
- ✅ Session status is 'SCHEDULED' or 'JOIN_OPEN'

**To test immediately**, temporarily change the time check:
- Comment out `canJoinSession()` condition
- Or manually update `scheduled_start_at` in database to be soon

### Join Button Opens Nothing?

- Check `sessions.join_url` in database is not null
- Try copying the URL and pasting in browser
- If URL is invalid, the video provider connection may be broken

## Next Steps for Testing

1. **Create Test Booking Soon:**
   - Create a booking scheduled to start in 10 minutes
   - Wait until 5 minutes before
   - Join button should appear

2. **Test No-Show Flow:**
   - Create session with start time in past
   - Tutor joins session
   - Student doesn't join
   - Tutor clicks "Mark No-Show" button
   - Check database: `status` = 'NO_SHOW_STUDENT'

3. **Test Charge Processing:**
   - Wait for session end time to pass
   - Run cron job: `curl http://localhost:3000/api/cron/process-charges`
   - Check database: `status` = 'COMPLETED_ASSUMED', `charged_at` populated

## Summary

✅ **RLS policies added** - Students and tutors can now view their own sessions  
✅ **Buttons split** - "View Session" and "Join" are now separate  
✅ **Both sides updated** - Student and tutor session lists have proper buttons  
✅ **Session creation working** - Already implemented in booking confirmation flow  
✅ **Join timing enforced** - Button only shows 5 minutes before start  

**Your sessions system should now work end-to-end!** 🎉




