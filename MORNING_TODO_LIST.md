# Morning Work Session - TODO List

## 🌅 Overview

Comprehensive task list for improving iTutor platform functionality and notifications.

---

## 📋 Task Categories

### **Category 1: Keep Me Signed In Feature** (3 tasks)

#### Task 1.1: Implement 'Keep Me Signed In' option on login pages
**Status**: Pending  
**Scope**: Add checkbox UI to all login pages  
**Files to modify**:
- `app/login/page.tsx` (Student login)
- `app/tutor/login/page.tsx` (Tutor login)
- `app/signup/parent/page.tsx` (Parent signup/login)

**UI Design**:
```tsx
<label className="flex items-center gap-2">
  <input type="checkbox" checked={rememberMe} onChange={...} />
  <span>Keep me signed in</span>
</label>
```

---

#### Task 1.2: Add checkbox to login forms
**Status**: Pending  
**Scope**: Add state management and UI for checkbox  
**Requirements**:
- Default to unchecked for security
- Store state in component
- Clear visual design matching iTutor theme

---

#### Task 1.3: Implement persistent session logic with Supabase auth
**Status**: Pending  
**Scope**: Configure Supabase session persistence  
**Technical details**:
- Use `supabase.auth.signInWithPassword()` options
- Set `options.persistSession: true/false` based on checkbox
- Update session storage settings
- Test session expiration behavior

**Reference**: https://supabase.com/docs/reference/javascript/auth-signinwithpassword

---

### **Category 2: Verify Current Notifications** (4 tasks)

#### Task 2.1: Verify 10-minute session reminder notifications are working
**Status**: Pending  
**Test procedure**:
1. Create test session 12 minutes from now
2. Wait for notification window (9-11 minutes before)
3. Check browser receives push notification
4. Verify both student and tutor receive notification

**SQL to run**: `DEBUG_10MIN_NOTIFICATIONS.sql`

---

#### Task 2.2: Verify FCM service account is configured in Supabase
**Status**: Pending  
**Steps**:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate service account key if not done
3. Add to Supabase: Edge Functions → Secrets
4. Secret name: `FCM_SERVICE_ACCOUNT_JSON`
5. Verify secret exists: `supabase secrets list`

**Guide**: `GET_FCM_SERVICE_ACCOUNT_GUIDE.md`

---

#### Task 2.3: Verify session-reminder-10-min Edge Function is scheduled
**Status**: Pending  
**Steps**:
1. Check Edge Function is deployed: `supabase functions list`
2. Verify schedule: Go to Supabase Dashboard → Edge Functions → session-reminder-10-min → Schedules
3. Should be: `* * * * *` (every minute)
4. Check recent invocations in logs
5. Look for any errors

---

#### Task 2.4: Verify push tokens are being registered in database
**Status**: Pending  
**SQL to verify**:
```sql
SELECT 
    pt.user_id,
    p.full_name,
    p.email,
    pt.platform,
    pt.created_at,
    pt.last_used_at
FROM push_tokens pt
JOIN profiles p ON pt.user_id = p.id
ORDER BY pt.created_at DESC
LIMIT 10;
```

**Expected**: Tokens with `platform = 'web'` for logged-in users

---

### **Category 3: Implement New Notification Features** (8 tasks)

#### Task 3.1: Add push notifications for new booking requests
**Status**: Pending  
**Who gets notified**: Tutor  
**When**: Student creates a booking request  
**Current**: ✅ In-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Create Edge Function or database trigger
- Send FCM notification to tutor's push tokens
- Template: "New booking request from [Student Name]"
- Deep link: `/tutor/bookings/[bookingId]`

---

#### Task 3.2: Add push notifications when tutor accepts booking
**Status**: Pending  
**Who gets notified**: Student  
**When**: Tutor confirms booking  
**Current**: ✅ In-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Trigger on booking status change to CONFIRMED
- Send FCM notification to student's push tokens
- Template: "Your booking request has been accepted!"
- Deep link: `/student/bookings/[bookingId]`

---

#### Task 3.3: Add push notifications when tutor declines booking
**Status**: Pending  
**Who gets notified**: Student  
**When**: Tutor declines booking  
**Current**: ✅ In-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Trigger on booking status change to DECLINED
- Send FCM notification to student
- Template: "Your booking request was declined"
- Deep link: `/student/bookings/[bookingId]`

---

#### Task 3.4: Add push notifications when tutor makes counter offer
**Status**: Pending  
**Who gets notified**: Student  
**When**: Tutor proposes alternative time  
**Current**: ✅ In-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Trigger on booking status change to COUNTER_PROPOSED
- Send FCM notification to student
- Template: "Your tutor proposed a different time"
- Deep link: `/student/bookings/[bookingId]`

---

#### Task 3.5: Add push notifications when session is cancelled
**Status**: Pending  
**Who gets notified**: Both student and tutor  
**When**: Session is cancelled by either party  
**Current**: ❓ Check if in-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Trigger on session status change to CANCELLED
- Send FCM notification to both parties
- Template: "Session cancelled - [Date & Time]"
- Deep link: `/tutor/sessions/[sessionId]` or `/student/sessions`

---

#### Task 3.6: Add push notifications when reschedule is proposed
**Status**: Pending  
**Who gets notified**: Student  
**When**: Tutor proposes reschedule for cancelled session  
**Current**: ❓ Check if in-app notification exists  
**Need**: Add push notification  

**Implementation**:
- Trigger when reschedule_proposed_start is set
- Send FCM notification to student
- Template: "Your tutor proposed a reschedule"
- Deep link: `/student/sessions`

---

#### Task 3.7: Create notification templates for all new notification types
**Status**: Pending  
**Scope**: Add to `supabase/functions/_shared/notificationTemplates.ts`  

**Templates needed**:
```typescript
export const BOOKING_REQUEST_RECEIVED = {
  type: 'booking_request_received',
  title: 'New Booking Request',
  body: 'You have a new booking request from {studentName}'
};

export const BOOKING_ACCEPTED = {
  type: 'booking_accepted',
  title: 'Booking Accepted!',
  body: 'Your booking request has been accepted by {tutorName}'
};

export const BOOKING_DECLINED = {
  type: 'booking_declined',
  title: 'Booking Declined',
  body: 'Your booking request was declined'
};

export const COUNTER_OFFER_RECEIVED = {
  type: 'counter_offer_received',
  title: 'Counter Offer Received',
  body: '{tutorName} proposed a different time'
};

export const SESSION_CANCELLED = {
  type: 'session_cancelled',
  title: 'Session Cancelled',
  body: 'Your session on {date} has been cancelled'
};

export const RESCHEDULE_PROPOSED = {
  type: 'reschedule_proposed',
  title: 'Reschedule Proposed',
  body: '{tutorName} proposed a new time for your session'
};
```

---

#### Task 3.8: Create or update Edge Functions to send notifications on booking events
**Status**: Pending  
**Approach**: Use Supabase Database Webhooks or create scheduled Edge Functions  

**Options**:

**Option A: Database Triggers + Edge Functions**
- Create PostgreSQL triggers on bookings table
- Trigger calls Supabase Edge Function via HTTP
- Edge Function sends FCM notifications

**Option B: Scheduled Edge Function (Polling)**
- Create Edge Function that runs every minute
- Checks for recent booking status changes
- Uses `notifications_log` for idempotency (like session reminders)
- Sends FCM notifications for new events

**Recommended**: Option B (easier, more reliable, follows existing pattern)

**Files to create**:
- `supabase/functions/booking-notifications/index.ts`
- Schedule: `* * * * *` (every minute)

---

### **Category 4: Refine Bookings & Sessions Pages** (3 tasks)

#### Task 4.1: Refine tutor/student bookings page UI and functionality
**Status**: Pending  
**Scope**: General improvements and polish  

**Ideas to consider**:
- Add search/filter functionality
- Add sorting options (date, status, price)
- Improve mobile responsiveness
- Add pagination if many bookings
- Better empty states
- Quick actions (accept/decline from list)
- Bulk actions

**User input needed**: Specific refinements desired

---

#### Task 4.2: Refine tutor/student sessions page UI and functionality
**Status**: Pending  
**Scope**: General improvements and polish  

**Ideas to consider**:
- Add filter by date range
- Add filter by status
- Show session ratings/feedback
- Add export functionality
- Calendar view option
- Better loading states
- Show upcoming vs past sessions separately

**User input needed**: Specific refinements desired

---

#### Task 4.3: Verify In Progress, Completed, No Show statuses display correctly
**Status**: Pending  
**Test procedure**:
1. Create test session
2. Check status before start: Should show "Upcoming"
3. Wait for start time: Should change to "In Progress"
4. Wait for end time: Should change based on completion
5. Verify colors match expected scheme
6. Test on both student and tutor accounts
7. Test on bookings page and sessions page

**Expected results**: Status accurately reflects session state at all times

---

## 🎯 Suggested Order of Execution

### Morning Session 1: Authentication (30-45 min)
1. Keep Me Signed In - Add checkbox UI
2. Keep Me Signed In - Implement Supabase logic
3. Test on all login pages

### Morning Session 2: Verify Current Notifications (20-30 min)
4. Check FCM setup
5. Check Edge Function deployment
6. Test 10-minute reminders
7. Verify push tokens

### Morning Session 3: New Notification Features (1-2 hours)
8. Create notification templates
9. Create booking-notifications Edge Function
10. Implement booking request notifications
11. Implement booking accepted notifications
12. Implement booking declined notifications
13. Implement counter offer notifications
14. Implement session cancelled notifications
15. Implement reschedule proposed notifications
16. Test all notification types

### Morning Session 4: Refine Pages (45-60 min)
17. Gather requirements for bookings page refinements
18. Gather requirements for sessions page refinements
19. Verify status displays are working correctly

---

## 📝 Notes

### Already Working ✅
- ✅ 10-minute session reminder notifications (needs verification)
- ✅ In-app notifications for booking requests
- ✅ Session status display (In Progress, Completed, No Show)
- ✅ Meeting link troubleshooting dropdown

### Dependencies
- FCM service account key from Firebase Console
- Supabase Edge Function deployment access
- Test user accounts for verification

### Documentation Available
- `DEBUG_10MIN_NOTIFICATIONS.sql` - Test current notifications
- `GET_FCM_SERVICE_ACCOUNT_GUIDE.md` - Get Firebase keys
- `FIX_BROWSER_NOTIFICATION_PERMISSION.md` - Browser setup
- `NOTIFICATION_TROUBLESHOOTING_QUICK_GUIDE.md` - Full guide

---

## 🚀 Quick Start Commands

### Check notifications setup:
```sql
-- Run in Supabase SQL Editor
\i DEBUG_10MIN_NOTIFICATIONS.sql
```

### Check Edge Functions:
```bash
supabase functions list
supabase secrets list
```

### Test push notification:
Create a session 12 minutes from now and wait for notification

---

## ✅ Success Criteria

**Keep Me Signed In**:
- [ ] Checkbox appears on all login pages
- [ ] Checking box keeps user logged in across browser sessions
- [ ] Unchecking box requires login after browser close

**Notifications Verified**:
- [ ] 10-minute session reminders work
- [ ] FCM credentials are configured
- [ ] Edge Function runs every minute
- [ ] Push tokens registered for test users

**New Notification Types**:
- [ ] Tutor receives push when booking request created
- [ ] Student receives push when booking accepted
- [ ] Student receives push when booking declined
- [ ] Student receives push when counter offer made
- [ ] Both receive push when session cancelled
- [ ] Student receives push when reschedule proposed
- [ ] All notifications have proper deep links
- [ ] No duplicate notifications

**Page Refinements**:
- [ ] Bookings page improvements identified and implemented
- [ ] Sessions page improvements identified and implemented
- [ ] Session statuses display accurately at all times

---

## 📞 Questions to Clarify

1. **Keep Me Signed In**: Should this be remembered per device or always ask?
2. **Bookings Page Refinements**: What specific improvements do you want? (search, filters, sorting, etc.)
3. **Sessions Page Refinements**: What specific improvements do you want? (date filters, calendar view, etc.)
4. **Notification Timing**: Should some notifications be sent immediately via database triggers instead of polling?

---

Ready to start when you are! ☕
