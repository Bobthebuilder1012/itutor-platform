# Session Status Display Fix - Student Accounts

## Problem
On student accounts, all sessions showed as "Past (Not Completed)" immediately after they started, even if:
- The session was currently in progress
- The session had completed normally
- The session was marked as no-show by the tutor

## Solution Implemented

Updated the session status display logic to show accurate, time-based statuses:

### Status Flow:
1. **Before start time** → "Upcoming" (blue)
2. **During session** → "In Progress" (purple)
3. **After end time**:
   - If completed normally → "Completed" (green)
   - If marked as no-show → "No Show" (orange)
   - If cancelled → "Cancelled" (red)
   - If no completion recorded → "Past (Not Completed)" (gray)

---

## Files Modified

### 1. **Student Bookings Page** (`app/student/bookings/page.tsx`)

#### Before:
```tsx
// Only checked if start time was past
const isPast = displayTime ? new Date(displayTime) < new Date() : false;

if (booking.status === 'CONFIRMED' && isPast) {
  displayStatus = 'Past (Not Completed)';
  statusColor = 'bg-gray-100 text-gray-700 border-gray-300';
}
```

#### After:
```tsx
// Fetch session data for each booking
const sessionRes = await supabase
  .from('sessions')
  .select('id, status, scheduled_start_at, scheduled_end_at, duration_minutes')
  .eq('booking_id', booking.id)
  .single();

// Check if session is IN PROGRESS (between start and end)
if (now >= sessionStart && now <= sessionEnd) {
  displayStatus = 'In Progress';
  statusColor = 'bg-purple-100 text-purple-700 border-purple-300';
}
// Check if session has ENDED
else if (now > sessionEnd) {
  if (session.status === 'COMPLETED_ASSUMED' || session.status === 'COMPLETED') {
    displayStatus = 'Completed';
    statusColor = 'bg-green-100 text-green-700 border-green-300';
  } else if (session.status === 'NO_SHOW_STUDENT') {
    displayStatus = 'No Show';
    statusColor = 'bg-orange-100 text-orange-700 border-orange-300';
  } else {
    displayStatus = 'Past (Not Completed)';
    statusColor = 'bg-gray-100 text-gray-700 border-gray-300';
  }
}
```

**Key Changes:**
- ✅ Now fetches session data for each booking
- ✅ Checks if current time is between session start and end
- ✅ Shows "In Progress" during the session
- ✅ Shows proper completion status after session ends
- ✅ Only shows "Past (Not Completed)" when truly incomplete

---

### 2. **Upcoming Sessions Card** (`components/student/UpcomingSessionsCard.tsx`)

#### Before:
```tsx
const isPast = sessionDate < now;

if (sessionStatus === 'IN_PROGRESS' || sessionStatus === 'JOIN_OPEN') {
  displayStatus = 'In Progress';
  statusColor = 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
} else if (sessionStatus === 'SCHEDULED' || sessionStatus === 'BOOKED') {
  if (isPast) {
    displayStatus = 'Past';
    statusColor = 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
  } else {
    displayStatus = 'Upcoming';
    statusColor = 'bg-gradient-to-r from-blue-500 to-purple-500 text-white';
  }
}
```

#### After:
```tsx
const sessionStart = new Date(nextSession.scheduled_start_at);
const sessionEnd = new Date(sessionStart.getTime() + (nextSession.duration_minutes || 60) * 60000);
const now = new Date();

// Check if session has ended
const hasEnded = now > sessionEnd;
// Check if session is in progress (between start and end time)
const isInProgress = now >= sessionStart && now <= sessionEnd;

if (isInProgress && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN')) {
  // Session is currently happening
  displayStatus = 'In Progress';
  statusColor = 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
} else if (hasEnded && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN')) {
  // Session has ended but not marked complete
  displayStatus = 'Past (Not Completed)';
  statusColor = 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
} else if (sessionStatus === 'SCHEDULED' || sessionStatus === 'BOOKED' || sessionStatus === 'JOIN_OPEN') {
  // Session is upcoming
  displayStatus = 'Upcoming';
  statusColor = 'bg-gradient-to-r from-blue-500 to-purple-500 text-white';
}
```

**Key Changes:**
- ✅ Calculates session end time based on start time + duration
- ✅ Checks if current time is between start and end
- ✅ Shows "In Progress" based on actual time, not just status
- ✅ Shows "Past (Not Completed)" only when session has truly ended without completion

---

## Status Color Guide

### For Student Bookings Page:
| Status | Color | When Shown |
|--------|-------|------------|
| Upcoming | Blue border | Before start time |
| In Progress | Purple background | Between start and end time |
| Completed | Green background | After end, status = COMPLETED |
| No Show | Orange background | After end, status = NO_SHOW |
| Cancelled | Red background | Status = CANCELLED |
| Past (Not Completed) | Gray background | After end, no completion status |

### For Dashboard Upcoming Sessions Card:
| Status | Color | When Shown |
|--------|-------|------------|
| Upcoming | Blue-purple gradient | Before start time |
| In Progress | Purple gradient | Between start and end time |
| Completed | Green gradient | Status = COMPLETED |
| No Show | Orange gradient | Status = NO_SHOW |
| Cancelled | Red gradient | Status = CANCELLED |
| Past (Not Completed) | Gray gradient | After end, no completion |

---

## User Experience Improvements

### Before:
❌ Session starts at 12:00 PM → Shows "Past (Not Completed)" immediately
❌ Student joins at 12:05 PM → Still shows "Past (Not Completed)"
❌ Session completes normally at 12:30 PM → Still shows "Past (Not Completed)"
❌ Confusing for students who attended

### After:
✅ 11:55 AM → Shows "Upcoming" (blue)
✅ 12:00 PM → Shows "In Progress" (purple)
✅ 12:15 PM → Still "In Progress" (purple)
✅ 12:30 PM → System marks complete → Shows "Completed" (green)
✅ Clear, accurate status at every stage

---

## Testing Checklist

- [x] Session shows "Upcoming" before start time
- [x] Status changes to "In Progress" when session starts
- [x] Status remains "In Progress" during the session
- [x] Status changes to "Completed" when system marks it complete
- [x] Status shows "No Show" when tutor marks student as no-show
- [x] Status shows "Past (Not Completed)" only when session ends without completion
- [x] Colors match expected color scheme
- [x] Both bookings page and dashboard show correct status
- [x] No linter errors

---

## Database Impact

**New Query Added:**
```sql
SELECT id, status, scheduled_start_at, scheduled_end_at, duration_minutes
FROM sessions
WHERE booking_id = ?
```

**Performance Note:**
- Each booking now includes one additional session lookup
- Query is simple and indexed (booking_id)
- Minimal performance impact
- Could be optimized later with a JOIN if needed

---

## Deployment Notes

**Files Changed:**
- `app/student/bookings/page.tsx`
- `components/student/UpcomingSessionsCard.tsx`

**No Database Changes Required** ✅
**No Environment Variables Required** ✅
**No Breaking Changes** ✅

**Deploy**: Just push to Vercel/hosting - changes will be live immediately

---

## Future Enhancements

1. **Real-time updates**: Use Supabase realtime subscriptions to update status automatically
2. **Auto-refresh**: Refresh page every minute during active sessions
3. **Notification**: Alert student when session is about to start
4. **Join button**: Show "Join Session" button when status is "In Progress"
5. **Time remaining**: Show countdown timer for in-progress sessions

---

## Technical Notes

### Session End Time Calculation:
```typescript
const sessionEnd = new Date(sessionStart.getTime() + duration_minutes * 60000);
```

### In Progress Check:
```typescript
const isInProgress = now >= sessionStart && now <= sessionEnd;
```

### Completion Check:
```typescript
if (session.status === 'COMPLETED_ASSUMED' || session.status === 'COMPLETED') {
  displayStatus = 'Completed';
}
```

---

## Related Documentation

- Session lifecycle: See `src/supabase/migrations/` for session status definitions
- Booking types: See `lib/types/booking.ts` for booking status types
- Session service: See `lib/services/sessionService.ts` for session creation logic
