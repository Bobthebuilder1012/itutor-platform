# Booking System Fixes

## Issues Fixed

### 1. ❌ Error when adding teaching hours (overnight sessions)
**Problem:** Database constraint prevented teaching hours that cross midnight (e.g., 10:45 PM to 5:00 AM).

**Fix:** 
- Run `FIX_BOOKING_SYSTEM.sql` in Supabase SQL Editor
- This removes the constraint that requires `end_time > start_time`

### 2. ✅ Reason field made optional
**Problem:** Users felt forced to enter a reason for unavailability blocks.

**Fix:**
- Updated the UI label to say "Reason (Optional - Private)"
- Updated placeholder text to clarify it's optional
- The database already allows NULL values, no migration needed

### 3. 🔍 Students can't see tutor calendar
**Problem:** Calendar widget shows "No availability" even when tutor has set teaching hours.

**Possible causes:**
- RPC function `get_tutor_public_calendar` not created
- RLS policies blocking access
- Tutor hasn't set any availability rules yet

**Fix:**
- Run `FIX_BOOKING_SYSTEM.sql` to verify all functions and policies exist
- Ensure migrations 010, 011, 012, 013 were all run successfully

---

## Step-by-Step Instructions

### Step 1: Run the fix SQL script

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the entire contents of `FIX_BOOKING_SYSTEM.sql`
4. Click "Run"
5. Check the output for ✓ checkmarks - all should pass

### Step 2: Restart your development server

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm run dev
```

### Step 3: Clear browser cache

- **Chrome/Edge:** Press `Ctrl+Shift+R` (hard refresh)
- **Firefox:** Press `Ctrl+F5`
- Or open an incognito/private window

### Step 4: Test the fixes

#### Test 1: Add overnight teaching hours (as tutor)
1. Go to Tutor Dashboard → Availability
2. Click "+ Add Hours"
3. Select "Monday"
4. Set Start Time: 10:45 PM
5. Set End Time: 5:00 AM
6. Set Session Duration: 60
7. Click "Add Teaching Hours"
8. **Expected:** Should save successfully with no errors

#### Test 2: Add unavailability block without reason (as tutor)
1. Go to Tutor Dashboard → Availability
2. Click "+ Add Block" under Unavailable Periods
3. Set start and end dates/times
4. **Leave the reason field empty**
5. Click "Add Unavailability Block"
6. **Expected:** Should save successfully

#### Test 3: View tutor calendar (as student)
1. Log in as a student
2. Go to Find Tutors
3. Click on a tutor profile
4. Scroll to the booking calendar widget
5. **Expected:** 
   - If tutor has set availability, you should see green "available" slots
   - If tutor has confirmed bookings, you should see grey "booked" slots
   - If tutor has unavailability blocks, you should see red "unavailable" slots
   - Week navigation buttons should work

---

## Troubleshooting

### Still getting constraint error when adding hours?

Check if the constraint was removed:
```sql
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.tutor_availability_rules'::regclass
AND conname LIKE '%check%';
```

If you see a constraint about `end_time > start_time`, manually drop it:
```sql
ALTER TABLE public.tutor_availability_rules
DROP CONSTRAINT tutor_availability_rules_check;
```

### Calendar still shows "No availability"?

1. **Verify tutor has set teaching hours:**
```sql
SELECT * FROM public.tutor_availability_rules 
WHERE tutor_id = 'YOUR_TUTOR_ID' 
AND is_active = true;
```

2. **Test the RPC function directly:**
```sql
SELECT * FROM get_tutor_public_calendar(
    'YOUR_TUTOR_ID'::uuid,
    NOW()::timestamptz,
    (NOW() + INTERVAL '7 days')::timestamptz
);
```

3. **Check RLS policies:**
```sql
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tutor_availability_rules', 'tutor_unavailability_blocks');
```

### Calendar widget not loading?

Check browser console for errors:
- Press F12 to open DevTools
- Go to Console tab
- Look for red error messages
- Share them if you need help

---

## Database Migrations Status

To verify all migrations have been run:

```sql
-- Check if all required tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'tutor_availability_rules',
    'tutor_unavailability_blocks',
    'session_types',
    'bookings',
    'booking_messages',
    'tutor_response_metrics'
)
ORDER BY tablename;
```

Expected result: All 6 tables should be listed.

```sql
-- Check if RPC functions exist
SELECT proname FROM pg_proc 
WHERE proname IN (
    'get_tutor_public_calendar',
    'create_booking_request',
    'tutor_confirm_booking',
    'tutor_decline_booking',
    'tutor_counter_offer',
    'student_accept_counter',
    'student_cancel_booking'
)
ORDER BY proname;
```

Expected result: All 7 functions should be listed.

---

## Need More Help?

If issues persist after following all steps above:

1. Check the browser console (F12) for JavaScript errors
2. Check the terminal where `npm run dev` is running for server errors
3. Check Supabase logs in Dashboard → Logs → API
4. Run `FIX_BOOKING_SYSTEM.sql` again and share the output














