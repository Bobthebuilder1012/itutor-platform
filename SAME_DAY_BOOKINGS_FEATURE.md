# Same-Day Bookings Feature

## Overview
Added a new feature to allow specific tutors (primarily for testing) to accept bookings on the same day without the standard 24-hour advance notice requirement.

## User Enabled
**JovanMR** (jovangoodluck@myitutor.com) can now accept same-day bookings for testing purposes.

## What Was Changed

### 1. Database Migration (`072_allow_same_day_bookings_for_testing.sql`)
- Added `allow_same_day_bookings` boolean column to `profiles` table (defaults to `false`)
- Updated `create_booking_request()` function to:
  - Check if the tutor has `allow_same_day_bookings` enabled
  - Enforce 24-hour advance notice for all tutors EXCEPT those with the flag enabled
  - Prevent booking sessions in the past (always enforced)
  - Show clear error message when booking is too soon: "Bookings must be made at least 24 hours in advance"
- Automatically enabled the feature for jovangoodluck@myitutor.com

### 2. Tutor Settings UI (`app/tutor/settings/page.tsx`)
- Added toggle switch in the "Profile Information" section
- **RESTRICTED TO SPECIFIC USER ONLY**: Only jovangoodluck@myitutor.com can see and use this toggle
- Other tutors will not see this option at all
- Toggle includes:
  - Clear icon (clock symbol)
  - "TEST MODE" badge
  - Description explaining when to use it
  - Highlighted in yellow to draw attention
  - Saves automatically when "Save Profile" is clicked

### 3. TypeScript Types (`lib/types/database.ts`)
- Added `allow_same_day_bookings?: boolean` to the `Profile` interface

## How to Test

### Quick Enable (Already Done)
The user JovanMR (jovangoodluck@myitutor.com) has been automatically enabled. Students can now book sessions with this tutor on the same day.

### Manual Enable for Other Tutors
Run this SQL in Supabase SQL Editor:

```sql
UPDATE public.profiles
SET allow_same_day_bookings = true
WHERE email = 'tutor-email@example.com'
AND role = 'tutor';
```

### Via UI (Only for jovangoodluck@myitutor.com)
1. Log in as JovanMR (jovangoodluck@myitutor.com)
2. Go to Settings → Profile Information
3. Scroll to "Allow Same-Day Bookings" toggle (with TEST MODE badge)
4. Turn it ON/OFF as needed
5. Click "Save Profile"

**Note:** Other tutors will NOT see this toggle - it's restricted to the test user only.

## Testing Scenarios

### Scenario 1: Normal Tutor (24-hour rule enforced)
```
Tutor: allow_same_day_bookings = false (or NULL)
Student tries to book: Tomorrow at 10 AM (23 hours from now)
Result: ❌ Error - "Bookings must be made at least 24 hours in advance"
```

### Scenario 2: Test Tutor (Same-day allowed)
```
Tutor: allow_same_day_bookings = true
Student tries to book: Today at 3 PM (2 hours from now)
Result: ✅ Success - Booking created
```

### Scenario 3: Past Time (Always blocked)
```
Tutor: allow_same_day_bookings = true
Student tries to book: Yesterday at 2 PM
Result: ❌ Error - "Cannot book sessions in the past"
```

## Rollback Instructions

If you need to disable this feature:

```sql
-- Disable for all tutors
UPDATE public.profiles
SET allow_same_day_bookings = false;

-- Or remove the column entirely
ALTER TABLE public.profiles DROP COLUMN IF EXISTS allow_same_day_bookings;
```

Then redeploy the previous version of `create_booking_request` function.

## Files Modified

1. ✅ `src/supabase/migrations/072_allow_same_day_bookings_for_testing.sql` - Migration
2. ✅ `ENABLE_SAME_DAY_BOOKINGS_TEST.sql` - Quick enable script
3. ✅ `app/tutor/settings/page.tsx` - Settings UI
4. ✅ `lib/types/database.ts` - TypeScript types

## Next Steps

1. **Apply the migration** in Supabase:
   ```bash
   # Or run the migration file in Supabase SQL Editor
   ```

2. **Test the feature:**
   - Log in as a student
   - Try to book JovanMR for a session today
   - Should work without the 24-hour error

3. **UI Toggle Test:**
   - Log in as JovanMR (tutor account)
   - Go to Settings
   - Verify the toggle appears and saves correctly

## Security Notes

- ✅ **UI is restricted to jovangoodluck@myitutor.com only** - Other tutors cannot see or access the toggle
- ✅ The flag is per-tutor, not per-booking
- ✅ Past bookings are still blocked (security measure)
- ✅ All other validation rules still apply (duration, availability, etc.)
- ✅ Even if another tutor somehow has the flag set in the database, they cannot modify it through the UI

## Production Considerations

This feature is designed primarily for testing. In production:
- Most tutors should keep this OFF (default behavior)
- Only enable for:
  - Internal test accounts
  - Tutors offering "drop-in" style sessions
  - Emergency/last-minute availability scenarios
