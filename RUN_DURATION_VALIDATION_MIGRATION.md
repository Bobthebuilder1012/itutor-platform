# Variable Session Duration Migration Guide

## Overview
This migration adds support for custom session durations (30 minutes to 5 hours) for both booking requests and lesson offers.

## What This Migration Does

### 1. Database Functions
- **`validate_consecutive_slots()`** - Validates that a time range is available for booking
- **`calculate_session_price()`** - Calculates price based on hourly rate and duration
- **`student_request_booking()`** - Updated to accept duration parameter
- **`tutor_confirm_booking()`** - Updated to validate duration
- **`create_booking_request()`** - Updated to accept duration and calculate price

### 2. Database Schema
- Adds `counter_duration_minutes` column to `lesson_offers` table (if it doesn't exist)
- Adds validation constraints for duration (30-300 minutes)

### 3. Frontend Changes
- **Booking Request Modal**: Duration input field (30-300 minutes)
- **Send Lesson Offer Modal**: Duration input field
- **Counter Offer Modal**: Duration input field for students to propose different durations
- **All Booking/Session Lists**: Display duration information

## Prerequisites

Before running this migration, ensure you have:
- [ ] Supabase project access
- [ ] SQL Editor access
- [ ] Backup of your database (recommended)

## Migration Steps

### Step 1: Run the SQL Migration

1. Open Supabase SQL Editor:
   - Go to https://supabase.com/dashboard
   - Select your iTutor project
   - Click "SQL Editor" in the left sidebar

2. Copy the entire contents of `ADD_DURATION_VALIDATION.sql`

3. Paste into SQL Editor and click "Run" (or press Ctrl+Enter)

4. Verify success - you should see:
   ```
   Success. No rows returned
   ```

### Step 2: Verify Migration

Run these SQL queries to verify the migration:

```sql
-- Check that validate_consecutive_slots function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'validate_consecutive_slots',
  'calculate_session_price',
  'student_request_booking',
  'tutor_confirm_booking',
  'create_booking_request'
);
```

Expected: 5 rows (all 5 functions should exist)

```sql
-- Check that counter_duration_minutes column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'lesson_offers' 
AND column_name = 'counter_duration_minutes';
```

Expected: 1 row showing the column exists

### Step 3: Test the Feature

#### For Students:
1. Go to Find Tutors page
2. Select a tutor and click on an available time slot
3. **NEW**: In the booking modal, you'll see a "Duration (minutes)" input
4. Change the duration (try 90 minutes, 120 minutes, etc.)
5. **Verify**: Price updates automatically based on duration
6. Submit the booking request

#### For Tutors:
1. Go to a student profile
2. Click "Send Lesson Offer"
3. Fill in subject, date, time
4. **NEW**: Enter custom duration (try 90, 120, 180 minutes)
5. **Verify**: System validates conflicts for the full duration
6. Send the offer

#### For Counter Offers:
1. As a student, receive a lesson offer
2. Click "Counter Offer"
3. Select a new time from calendar
4. **NEW**: Adjust the "Duration (minutes)" field
5. Submit counter offer

### Step 4: Verify Display

Check that duration is shown in:
- [ ] Student bookings list
- [ ] Student booking details page
- [ ] Tutor bookings list
- [ ] Tutor booking details page
- [ ] Student sessions list
- [ ] Tutor sessions list
- [ ] Student dashboard (upcoming sessions)
- [ ] Tutor dashboard (upcoming sessions)
- [ ] Lesson offers (sent and received)

## Key Business Rules

### Duration Limits
- **Minimum**: 30 minutes
- **Maximum**: 5 hours (300 minutes)
- **Recommended step**: 15 minutes

### Price Calculation
```
price = (hourly_rate / 60) × duration_minutes
```

Examples:
- 60 minutes @ $100/hour = $100
- 90 minutes @ $100/hour = $150
- 120 minutes @ $100/hour = $200

### Slot Validation
When a booking or offer is for more than 60 minutes, the system:
1. Checks that ALL consecutive time slots are available
2. Validates against existing confirmed bookings
3. Validates against unavailability blocks
4. Returns error if ANY part of the duration conflicts

### Session Rules (Unchanged)
- No-show wait time: 33% of duration
- Minimum payable duration: 66% of duration
- These calculate dynamically based on actual duration

## Backwards Compatibility

This migration is **fully backwards compatible**:
- ✅ Existing bookings continue to work
- ✅ Default duration is 60 minutes if not specified
- ✅ Old booking requests without duration still function
- ✅ Database functions have default parameters

## Troubleshooting

### Error: "Duration must be at least 30 minutes"
- **Cause**: Trying to book less than 30 minutes
- **Fix**: Increase duration to minimum 30 minutes

### Error: "The requested time slot(s) are not available"
- **Cause**: Some slots within the duration are already booked or blocked
- **Fix**: Choose a different start time or shorter duration

### Error: "You have a class at this time"
- **Cause**: Tutor trying to send offer but has confirmed booking that overlaps
- **Fix**: Cancel the conflicting booking or choose a different time

### Price Not Updating
- **Cause**: Browser cache
- **Fix**: Hard refresh (Ctrl+Shift+R) or clear browser cache

### Duration Not Saving
- **Cause**: Database function not updated
- **Fix**: Re-run the SQL migration, ensure all 5 functions are updated

## Rollback Plan

If you need to rollback this migration:

```sql
-- Drop new functions (keep old versions)
DROP FUNCTION IF EXISTS validate_consecutive_slots(uuid, timestamptz, int);
DROP FUNCTION IF EXISTS calculate_session_price(numeric, int);

-- Remove column (optional - won't break anything if left)
ALTER TABLE lesson_offers DROP COLUMN IF EXISTS counter_duration_minutes;

-- Note: student_request_booking, tutor_confirm_booking, and create_booking_request
-- can remain as-is since they have default parameters and are backwards compatible
```

Then revert frontend changes by checking out previous git commit.

## Testing Checklist

Before considering this feature complete, test:

- [ ] Student can request 30-minute session
- [ ] Student can request 90-minute session
- [ ] Student can request 2-hour session
- [ ] Student can request 5-hour session (maximum)
- [ ] Price scales correctly for each duration
- [ ] Tutor can send 90-minute lesson offer
- [ ] Tutor can send 2-hour lesson offer
- [ ] System blocks booking if any slot in duration is unavailable
- [ ] System blocks tutor offer if conflicts with existing booking
- [ ] Student can counter with different duration
- [ ] Tutor can accept counter-offer with different duration
- [ ] Duration displays correctly in all lists
- [ ] Session creation uses correct duration from booking
- [ ] No-show wait time calculates correctly (33% of duration)
- [ ] Minimum payable time calculates correctly (66% of duration)

## Support

If you encounter issues:
1. Check browser console (F12) for error messages
2. Check Supabase logs for database errors
3. Verify all 5 database functions were created
4. Verify `counter_duration_minutes` column exists
5. Try hard refresh (Ctrl+Shift+R)
6. Clear browser cache and cookies

## Future Enhancements

Potential improvements for later:
- [ ] Preset duration buttons (30min, 60min, 90min, 2hr)
- [ ] Duration templates per subject
- [ ] Bulk duration editing for multiple sessions
- [ ] Duration-based pricing tiers
- [ ] Maximum duration per tutor setting
- [ ] Visual calendar showing multi-slot selection




