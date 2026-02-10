# Flexible Booking System - Deployment Guide

## Overview

This flexible booking system allows students to book sessions at custom 15-minute intervals (e.g., 12:15-1:15, 12:30-1:30) within a tutor's availability windows. The calendar intelligently shows partial availability around existing bookings.

## Features

- **15-Minute Interval Booking**: Students can book starting at any 15-minute mark within tutor availability
- **Custom Session Durations**: Choose from 30 min, 1 hour, 1.5 hours, or 2 hours
- **Smart Availability Display**: Shows partial time slots around existing bookings
  - Example: If 1:30-2:30 is booked, system shows 1:00-1:30 and 2:30-3:00 as available
- **Real-Time Validation**: Backend validates that custom times fit within availability windows and don't overlap with existing bookings

## Deployment Steps

### Step 1: Apply Database Migration

Run the SQL migration in your Supabase SQL Editor:

**File**: `src/supabase/migrations/074_flexible_booking_windows.sql`

This migration:
- Updates `get_tutor_public_calendar()` to return availability windows instead of fixed slots
- Adds `is_time_slot_available()` function for validation
- Respects same-day booking settings per tutor
- Returns data in format: `{ availability_windows: [], busy_blocks: [], allows_flexible_booking: true }`

**To apply:**
1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to SQL Editor
3. Copy contents of `074_flexible_booking_windows.sql`
4. Paste and run
5. Verify success message appears

### Step 2: Push Code Changes

All frontend code changes are already complete:

**Main Repository:**
- ✅ `lib/types/booking.ts` - Updated types to support `AvailabilityWindow`
- ✅ `components/booking/FlexibleTimePicker.tsx` - New component for custom time selection
- ✅ `components/booking/TutorCalendarWidget.tsx` - Updated to support both fixed-slot (legacy) and flexible modes
- ✅ `lib/services/bookingService.ts` - Added `validateTimeSlotAvailability()` function

**Pilot Submodule:**
- ✅ All changes replicated to `Pilot/` folder

### Step 3: Test the System

#### Test Scenario 1: Basic Flexible Booking
1. Log in as a student
2. Navigate to Find iTutors and select a tutor
3. Click "Book Session"
4. Observe:
   - Calendar shows days with availability (green boxes)
   - Click on an available date
   - Time picker appears showing:
     - Tutor's availability window (e.g., "12:00 PM - 4:00 PM")
     - Session duration selector
     - Start time dropdown with 15-minute intervals
     - Selected time summary
5. Select a custom time (e.g., 12:15 PM, 1 hour duration)
6. Create booking
7. Verify booking appears in both student and tutor dashboards

#### Test Scenario 2: Partial Availability Display
1. As a tutor, create an availability window: 12:00 PM - 4:00 PM
2. Create a booking for 1:30 PM - 2:30 PM
3. As a student, view that tutor's calendar for the same day
4. Observe:
   - Availability window: 12:00 PM - 4:00 PM
   - Busy block: 1:30 PM - 2:30 PM  (shown in gray)
   - Start time dropdown should show times like:
     - 12:00 PM ✅
     - 12:15 PM ✅
     - 12:30 PM ✅
     - 12:45 PM ❌ (would overlap with 1:30 booking)
     - 1:00 PM ❌ (would overlap)
     - 1:15 PM ❌ (would overlap)
     - 1:30 PM ❌ (busy)
     - 2:30 PM ✅ (after booking ends)
     - 2:45 PM ✅
     - 3:00 PM ✅

#### Test Scenario 3: Same-Day Booking Validation
1. As a tutor with `allow_same_day_bookings = true`:
   - Create availability for today, 2:00 PM - 6:00 PM
2. As a student at 1:00 PM:
   - Should see all future times (2:00 PM onwards)
   - Should be able to book 2:15 PM - 3:15 PM
3. As a tutor with `allow_same_day_bookings = false`:
   - Student should not see today's availability
   - Should only see tomorrow onwards

#### Test Scenario 4: Legacy Mode Compatibility
1. Temporarily roll back the migration or test with old calendar data
2. System should fall back to fixed-slot display mode
3. Calendar shows time slots (not date selection)
4. Booking works as before

### Step 4: Monitor for Issues

**Common Issues:**

1. **"No available start times for this duration"**
   - Cause: Selected duration too long for remaining availability window
   - Solution: Choose shorter duration or different date

2. **"Selected time overlaps with an existing booking"**
   - Cause: Validation detected conflict with busy block
   - Solution: Calendar data successfully protecting against double-booking

3. **Times not showing up**
   - Check tutor has `allow_same_day_bookings = true` (run `FIX_SAME_DAY_BOOKINGS.sql` if needed)
   - Verify tutor has availability rules configured
   - Check browser console for errors

4. **Calendar shows fixed slots instead of flexible mode**
   - Migration may not have applied correctly
   - Check database function: `SELECT get_tutor_public_calendar(...)`
   - Should return `allows_flexible_booking: true`

## Rollback Plan

If issues arise, you can rollback by restoring the old `get_tutor_public_calendar` function:

```sql
-- Run the previous version from migration 012_booking_functions.sql or 073_update_calendar_for_same_day_bookings.sql
-- This will restore fixed-slot behavior
```

The frontend is backward-compatible and will automatically detect the absence of `allows_flexible_booking` flag and use legacy mode.

## Architecture Notes

### Database Layer
- `get_tutor_public_calendar()` returns availability windows + busy blocks
- `is_time_slot_available()` validates custom time selections
- Respects `allow_same_day_bookings` flag per tutor

### Frontend Layer
- `FlexibleTimePicker` component generates 15-min intervals
- Filters out times that would overlap busy blocks
- Real-time calculation of end time based on start + duration
- Validation on both frontend (UX) and backend (security)

### Booking Flow
1. Student selects date → FlexibleTimePicker loads
2. Student selects duration → Available start times recalculated
3. Student selects start time → End time calculated automatically
4. On submit → Backend validates with `is_time_slot_available()`
5. If valid → Booking created with custom start/end times

## Success Criteria

✅ Students can book at custom 15-minute intervals
✅ Calendar shows partial availability around bookings
✅ Same-day booking works correctly
✅ Backend validation prevents double-booking
✅ Legacy fixed-slot mode still works if needed
✅ All tests pass
✅ No errors in browser console
✅ No errors in database logs

## Support

If you encounter any issues:
1. Check browser console for frontend errors
2. Check Supabase logs for backend errors
3. Verify migration applied successfully
4. Test with both flexible and legacy mode
5. Review `FLEXIBLE_BOOKING_DEPLOYMENT_GUIDE.md` (this file)
