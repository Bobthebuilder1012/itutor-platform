# Session Status Display Fix

## Problem

Sessions were showing incorrect statuses on both tutor and student booking pages:

### Tutor Accounts
- ❌ In-progress sessions displayed as **"Confirmed"**
- Should show as **"In Progress"**

### Student Accounts  
- ❌ In-progress sessions displayed as **"Past"**
- Should show as **"In Progress"**

### Additional Issues
- Tab filtering incorrectly categorized in-progress sessions
- Sessions without proper end times caused calculation errors

## Root Cause

1. **Tab Filtering Logic**: The `isBookingPast()` function didn't account for sessions currently in progress
   - It only checked if the end time had passed
   - This caused in-progress sessions to be marked as "past"

2. **Duration Calculation**: Missing fallback when `duration_minutes` was null
   - `session.duration_minutes * 60000` would fail if null
   - Needed: `(session.duration_minutes || 60) * 60000`

3. **Status Display**: While the display logic was correct, the tab filtering was overriding the visual status

## Solution

### 1. Added `isBookingInProgress()` Helper

```typescript
const isBookingInProgress = (booking: any) => {
  if (booking.status === 'CONFIRMED' && booking.session) {
    const now = new Date();
    const session = booking.session;
    const sessionStart = new Date(session.scheduled_start_at);
    const sessionEnd = new Date(
      session.scheduled_end_at || 
      new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000)
    );
    
    return now >= sessionStart && now <= sessionEnd;
  }
  return false;
};
```

### 2. Updated `isBookingPast()` Logic

```typescript
const isBookingPast = (booking: any) => {
  // Don't count in-progress sessions as past
  if (isBookingInProgress(booking)) return false;
  
  // Rest of the logic...
  if (booking.status === 'CONFIRMED' && booking.session) {
    const sessionEnd = new Date(
      session.scheduled_end_at || 
      new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000)
    );
    return now > sessionEnd;
  }
  // ...
};
```

### 3. Fixed Duration Calculation

Changed all instances of:
```typescript
// Before (fails if duration_minutes is null)
new Date(sessionStart.getTime() + session.duration_minutes * 60000)

// After (defaults to 60 minutes)
new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000)
```

## Status Display Logic

Sessions now display correctly based on real-time status:

### ✅ In Progress
- **Condition**: `now >= sessionStart && now <= sessionEnd`
- **Status**: "In Progress"
- **Color**: Purple (bg-purple-100 text-purple-700 border-purple-300)
- **Tab**: Shows in "Confirmed" tab (as it's still an active confirmed booking)

### ✅ Completed
- **Condition**: `now > sessionEnd && session.status === 'COMPLETED'`
- **Status**: "Completed"
- **Color**: Green (bg-green-100 text-green-700 border-green-300)
- **Tab**: Shows in "Past" tab

### ✅ No Show
- **Condition**: `now > sessionEnd && session.status === 'NO_SHOW_STUDENT'`
- **Status**: "No Show"
- **Color**: Orange (bg-orange-100 text-orange-700 border-orange-300)
- **Tab**: Shows in "Past" tab

### ✅ Cancelled
- **Condition**: `session.status === 'CANCELLED'`
- **Status**: "Cancelled"
- **Color**: Red (bg-red-100 text-red-700 border-red-300)
- **Tab**: Shows in "Cancelled" tab

### ✅ Past (Not Completed)
- **Condition**: `now > sessionEnd && status not completed/no-show/cancelled`
- **Status**: "Past (Not Completed)"
- **Color**: Gray (bg-gray-100 text-gray-700 border-gray-300)
- **Tab**: Shows in "Past" tab

### ✅ Confirmed (Upcoming)
- **Condition**: `now < sessionStart`
- **Status**: "Confirmed"
- **Color**: Blue (bg-blue-100 text-blue-700 border-blue-300)
- **Tab**: Shows in "Confirmed" tab

## Files Modified

1. **`app/tutor/bookings/page.tsx`**
   - Added `isBookingInProgress()` helper
   - Updated `isBookingPast()` logic
   - Fixed duration calculation

2. **`app/student/bookings/page.tsx`**
   - Added `isBookingInProgress()` helper
   - Updated `isBookingPast()` logic
   - Fixed duration calculation

## Testing

### Test In-Progress Status

1. Create a session starting now or in the past few minutes
2. View the booking on both tutor and student accounts
3. ✅ Should show **"In Progress"** with purple badge
4. ✅ Should appear in **"Confirmed"** tab (not "Past" tab)

### Test Completed Status

1. Wait for session to end naturally
2. Mark session as completed (auto or manual)
3. ✅ Should show **"Completed"** with green badge
4. ✅ Should appear in **"Past"** tab

### Test No Show Status

1. Wait for session to end
2. Mark as "No Show"
3. ✅ Should show **"No Show"** with orange badge
4. ✅ Should appear in **"Past"** tab

### Test Tab Counts

1. Check that tab counts are accurate:
   - "Confirmed" should include upcoming sessions and in-progress sessions
   - "Past" should only include ended sessions (completed, no-show, or not completed)
   - In-progress sessions should NOT be double-counted

## SQL Query to Test

```sql
-- Find sessions that should be "In Progress"
SELECT 
  s.id,
  s.scheduled_start_at,
  s.scheduled_end_at,
  s.duration_minutes,
  s.status,
  b.id as booking_id,
  b.status as booking_status,
  CASE 
    WHEN now() >= s.scheduled_start_at 
     AND now() <= COALESCE(s.scheduled_end_at, s.scheduled_start_at + (s.duration_minutes || ' minutes')::interval)
    THEN '✅ IN PROGRESS'
    WHEN now() < s.scheduled_start_at THEN 'Upcoming'
    WHEN now() > COALESCE(s.scheduled_end_at, s.scheduled_start_at + (s.duration_minutes || ' minutes')::interval)
    THEN 'Past'
  END as time_status
FROM sessions s
JOIN bookings b ON b.id = s.booking_id
WHERE b.status = 'CONFIRMED'
  AND s.status = 'SCHEDULED'
ORDER BY s.scheduled_start_at DESC
LIMIT 20;
```

## Benefits

✅ **Accurate Status Display** - Sessions show the correct real-time status
✅ **Proper Tab Filtering** - Sessions appear in the correct tab
✅ **Consistent Across Roles** - Tutor and student see the same status
✅ **No Duplicates** - In-progress sessions don't appear in multiple tabs
✅ **Robust Calculation** - Handles missing duration_minutes gracefully
✅ **Real-Time Updates** - Status changes automatically as time passes

## Notes

- The UI updates in real-time as you navigate (page refresh updates the status)
- For truly real-time updates without refresh, consider adding a timer that recalculates statuses every minute
- Session end times use `scheduled_end_at` if available, otherwise calculate from `scheduled_start_at + duration_minutes`
- Default duration is 60 minutes if not specified
