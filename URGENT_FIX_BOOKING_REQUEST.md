# URGENT FIX: Create Booking Request Error

## Error You're Seeing
```
Could not find the function public.create_booking_request(p_duration_minutes, ...) in the schema cache
```

## Quick Fix (5 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your iTutor project
3. Click **"SQL Editor"** in left sidebar

### Step 2: Run This SQL

Copy the ENTIRE contents of `FIX_CREATE_BOOKING_REQUEST_DURATION.sql` and paste into SQL Editor, then click **"Run"**.

### Step 3: Verify It Worked

Run this query to confirm:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'create_booking_request';
```

You should see **1 row** returned.

### Step 4: Test Again

1. Refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Try creating a booking request again
3. The error should be gone! ✅

## What This Does

- Updates `create_booking_request()` function to accept duration parameter
- Calculates price based on duration automatically
- Validates duration is between 30-300 minutes
- Fully backwards compatible with existing bookings

## Still Having Issues?

If error persists:
1. Check browser console (F12) for new errors
2. Verify the SQL ran successfully (no red error messages)
3. Do a hard refresh (Ctrl+Shift+R)
4. Clear browser cache

The function **must** be created in the database before the frontend will work.













