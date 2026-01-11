# iTutor Booking System - Implementation Guide

## Overview
Complete booking system with tutor calendars and request→confirm flow.

## ✅ Completed: Backend (Database)

### 1. Database Tables Created
- ✅ `tutor_availability_rules` - Recurring teaching hours
- ✅ `tutor_unavailability_blocks` - Override availability  
- ✅ `session_types` - Duration/pricing templates
- ✅ `bookings` - Main booking table with request/confirm flow
- ✅ `booking_messages` - Chat + time proposals
- ✅ `tutor_response_metrics` - Avg response time tracking

### 2. RLS Policies
All tables have proper RLS policies:
- Tutors can only manage their own availability/blocks
- Students can view public calendar (via RPC, no private reasons)
- Both parties can view/update their bookings
- Messages restricted to participants

### 3. Database Functions (RPCs)

**Availability Engine:**
- `get_tutor_public_calendar(tutor_id, start, end)` - Returns available slots + busy blocks (NO private reasons)
- `get_tutor_availability_summary(tutor_id)` - Quick availability check for profile

**Booking Actions:**
- `create_booking_request(...)` - Student creates request
- `tutor_confirm_booking(booking_id)` - Tutor confirms (atomic conflict check)
- `tutor_decline_booking(booking_id, message?)` - Tutor declines
- `tutor_counter_offer(booking_id, new_start, new_end, message?)` - Tutor proposes alt time
- `student_accept_counter(booking_id, message_id)` - Student accepts (auto-confirms)
- `student_cancel_booking(booking_id, reason?)` - Student cancels
- `add_booking_message(booking_id, message)` - Send chat message

**Metrics:**
- `update_tutor_response_metrics(tutor_id)` - Recalculate avg response time

### 4. Key Business Rules Implemented

✅ **Pending doesn't block time** - Multiple students can request same slot while PENDING

✅ **CONFIRMED blocks time** - Once confirmed, no new requests for that exact slot allowed

✅ **Atomic conflict checks** - Race condition prevention via transaction + overlap query

✅ **Private reasons hidden** - Students never see `reason_private` from unavailability blocks

✅ **Auto-confirm on counter-accept** - When student accepts tutor's counter-offer, booking auto-confirms

✅ **Range limits** - Max 30 days, enforced at function level

✅ **Min notice** - 1 hour minimum (configurable in function)

## 🚧 TODO: Frontend Components

### Student Components
- [ ] `TutorCalendarWidget` - View tutor availability, book slots
- [ ] `BookingRequestModal` - Create booking with subject/session type
- [ ] `BookingThreadPage` - View booking details + messages
- [ ] `StudentBookingsPage` - List all bookings (tabs: Pending/Confirmed/Past)

### Tutor Components
- [ ] `TutorCalendarManagement` - Set availability rules + unavailability blocks
- [ ] `TutorBookingsInbox` - Pending requests with Accept/Decline/Counter
- [ ] `TutorBookingThread` - View request + respond
- [ ] `TutorSchedulePage` - Week view of confirmed bookings

### Shared Components
- [ ] `CalendarWeekView` - Reusable week calendar display
- [ ] `TimeSlotPicker` - Select time slots
- [ ] `BookingMessageThread` - Chat interface for booking thread

## SQL Migration Order

Run in Supabase SQL Editor in this order:
1. `010_create_booking_system.sql` - Tables + triggers
2. `011_booking_system_rls.sql` - RLS policies
3. `012_booking_functions.sql` - Core functions (calendar, confirm, decline)
4. `013_booking_functions_continued.sql` - Counter-offers, messages, metrics

## Database Schema Summary

### Booking Flow States

```
PENDING → COUNTER_PROPOSED → CONFIRMED → COMPLETED
           ↓                    ↓
        DECLINED            CANCELLED
```

### Booking Fields
```typescript
{
  id: uuid
  student_id: uuid
  tutor_id: uuid
  subject_id: uuid
  session_type_id: uuid
  
  // Requested by student initially
  requested_start_at: timestamptz
  requested_end_at: timestamptz
  
  // Set when tutor confirms
  confirmed_start_at: timestamptz | null
  confirmed_end_at: timestamptz | null
  
  status: 'PENDING' | 'COUNTER_PROPOSED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'
  last_action_by: 'student' | 'tutor'
  
  price_ttd: numeric
  student_notes: text
  tutor_notes: text
}
```

### Calendar Data Structure
```typescript
{
  available_slots: Array<{
    start_at: timestamptz
    end_at: timestamptz
  }>
  busy_blocks: Array<{
    start_at: timestamptz
    end_at: timestamptz
    type: 'BOOKED' | 'UNAVAILABLE'
  }>
}
```

## Frontend Implementation Plan

### Phase 1: Student Booking Flow
1. Add "Book Session" button to tutor profile
2. Show calendar widget with available/booked slots
3. Create booking request modal
4. Display booking thread with status

### Phase 2: Tutor Availability Management
1. Create availability rules UI (day/time pickers)
2. Add unavailability blocks (date range + reason)
3. Show week view of schedule

### Phase 3: Tutor Booking Management
1. Requests inbox with filters
2. Accept/Decline/Counter actions
3. Booking thread with time proposals

### Phase 4: Polish
1. Response time display on profiles
2. Conflict warnings in UI
3. Mobile responsive calendar
4. Loading states + error handling

## Testing Checklist

### Backend Tests (SQL)
- [ ] Create availability rule
- [ ] Get public calendar (verify no private reasons exposed)
- [ ] Create booking request (verify conflict detection)
- [ ] Confirm booking (verify atomic lock)
- [ ] Double booking race (should fail gracefully)
- [ ] Counter-offer flow
- [ ] Accept counter-offer (auto-confirms)
- [ ] Metrics calculation

### Frontend Tests
- [ ] Student can view tutor calendar
- [ ] Student can book available slot
- [ ] Student cannot book busy slot
- [ ] Tutor sees pending requests
- [ ] Tutor can confirm/decline
- [ ] Counter-offer creates time proposal
- [ ] Student can accept counter
- [ ] Messages appear in thread

## Edge Cases Handled

✅ **Double booking race** - Atomic checks in confirm/accept functions

✅ **Stale calendar data** - Always re-check conflicts before confirming

✅ **Competing confirms** - First confirm wins, others get "no longer available" error

✅ **Counter-offer on unavailable time** - Validated before proposal created

✅ **Accept counter after slot taken** - Re-checks availability

✅ **Privacy** - Students never see private reasons, only "Unavailable" label

✅ **Spam requests** - Soft-hide old pending in UI (can add rate limits later)

## Next Steps

1. **Run SQL migrations** in Supabase
2. **Test functions** manually via SQL editor
3. **Create TypeScript types** matching schema
4. **Build calendar widget** component
5. **Implement booking request** flow
6. **Add tutor inbox** page
7. **Test end-to-end** booking flow

## Notes

- Timezone: Currently using `timestamptz` (stores UTC). America/Port_of_Spain display handled client-side.
- Availability slots: Generated on-the-fly from rules + current date range
- Metrics: Updated after tutor actions (can be moved to cron job later)
- Reschedule: Use counter-offer flow while status=CONFIRMED
- No-show: Manual status change (can add auto-detection later)













