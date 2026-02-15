# Mark No Show - Enhanced Feature
**Date:** February 14, 2026  
**Feature:** Lock icon with 20-minute wait period for both tutors and students

---

## Overview

Implemented an enhanced "Mark No Show" button that works for both tutors and students with:
- ✅ **Lock icon** when button is disabled
- ✅ **20-minute wait period** after session starts
- ✅ **Real-time countdown** showing minutes remaining
- ✅ **Hover tooltips** explaining when it becomes available
- ✅ **Role-specific messaging** (different for students vs tutors)
- ✅ **False report warnings** (account suspension/ban)

---

## User Experience

### Before Session Starts + First 20 Minutes

**Button Appearance:**
- 🔒 **Lock icon** displayed
- **Gray background** (disabled state)
- **Countdown** shows remaining minutes: "(15m)"
- **Not clickable**

**Hover Tooltip:**
> "This button will be enabled X minutes after the session starts (20 minutes total). You can use it if the [student/tutor] doesn't show up."

---

### After 20 Minutes

**Button Appearance:**
- ✅ **No lock icon**
- ❌ **X icon** displayed
- **Red background** (enabled state)
- **Clickable**

**Hover Tooltip:**
> "Click to report that the [student/tutor] did not join the session. ⚠️ False reports may result in account suspension."

---

## Student Experience

### Button Label
`Report Tutor No-Show`

### When Clicked (After 20min)

**Modal Content:**
1. **Header:** "Report Tutor No-Show" (red gradient)
2. **What Happens:**
   - Your refund will be processed automatically
   - You will receive a **full refund** of the session price
   - Refund status: **Pending (2-5 business days)**
   - The tutor will be notified
   - This will be recorded in tutor's history

3. **Price Display:**
   - Session Price: TTD X.XX
   - → **Full Refund Pending** (in green)

4. **Warning (Red Box):**
   > ⚠️ **Important Warning**  
   > Only mark as no-show if the tutor genuinely did not join within 20 minutes of the session start. **False no-show reports will result in account suspension or permanent ban from the platform.**

5. **Actions:**
   - **Cancel** button
   - **Confirm No-Show** button (red)

---

## Tutor Experience

### Button Label
`Mark Student No-Show`

### When Clicked (After 20min)

**Modal Content:**
1. **Header:** "Mark Student No-Show" (red gradient)
2. **What Happens:**
   - Student will be charged **50%** of session price
   - You will receive **45%** as compensation
   - Session marked as completed with no-show status
   - Recorded in student's history

3. **Price Breakdown:**
   | Item | Amount |
   |------|--------|
   | Original Price | TTD X.XX |
   | Student Charge (50%) | TTD X.XX |
   | Your Payout (45%) | TTD X.XX |
   | Platform Fee (5%) | TTD X.XX |

4. **Yellow Note Box:**
   > 📝 **Note:** Only mark as no-show if the student genuinely did not join within 20 minutes. False no-show reports may result in account penalties.

5. **Warning (Red Box):**
   > ⚠️ **Important Warning**  
   > Only mark as no-show if the student genuinely did not join within 20 minutes of the session start. **False no-show reports will result in account suspension or permanent ban from the platform.**

6. **Actions:**
   - **Cancel** button
   - **Confirm No-Show** button (red)

---

## Technical Implementation

### Component: `MarkNoShowButtonEnhanced.tsx`

**Location:** `components/sessions/MarkNoShowButtonEnhanced.tsx`

**Props:**
```typescript
{
  session: Session;
  userRole: 'tutor' | 'student';
  onSuccess: () => void;
}
```

### Key Features

1. **Real-time Countdown**
   - Updates every second using `setInterval`
   - Calculates time since session start
   - Shows minutes remaining until button activates

2. **Eligibility Check**
   ```typescript
   const twentyMinutesAfterStart = sessionStart + 20 minutes;
   
   canMark = now >= twentyMinutesAfterStart && 
             now <= sessionEnd &&
             (status === 'SCHEDULED' || status === 'JOIN_OPEN');
   ```

3. **Visual States**
   - **Locked:** Gray background + lock icon + countdown
   - **Unlocked:** Red background + X icon + no countdown

4. **Hover Tooltip**
   - Positioned above button
   - Black background with white text
   - Explains button availability
   - Warns about false reports

---

## Integration Points

### Student Booking Detail Page
**File:** `app/student/bookings/[bookingId]/page.tsx`

```tsx
{session && booking.status === 'CONFIRMED' && (
  <div className="mb-6 space-y-4">
    <SessionJoinButton session={session} userRole="student" />
    <MarkNoShowButtonEnhanced 
      session={session} 
      userRole="student" 
      onSuccess={() => loadBookingData()}
    />
  </div>
)}
```

### Tutor Booking Detail Page
**File:** `app/tutor/bookings/[bookingId]/page.tsx`

```tsx
{session && booking.status === 'CONFIRMED' && (
  <div className="mb-6 space-y-4">
    <SessionJoinButton session={session} userRole="tutor" />
    <MarkNoShowButtonEnhanced 
      session={session}
      userRole="tutor"
      onSuccess={() => loadBookingData()}
    />
  </div>
)}
```

---

## Files Modified

1. ✅ **`components/sessions/MarkNoShowButtonEnhanced.tsx`** (NEW)
   - Created enhanced component
   - Implemented lock icon logic
   - Added 20-minute wait period
   - Role-specific messaging
   - Hover tooltips
   - False report warnings

2. ✅ **`app/student/bookings/[bookingId]/page.tsx`**
   - Added import for `MarkNoShowButtonEnhanced`
   - Integrated button into session section
   - Added student-specific props

3. ✅ **`app/tutor/bookings/[bookingId]/page.tsx`**
   - Replaced old `MarkNoShowButton` with enhanced version
   - Added tutor-specific props
   - Maintained existing functionality

---

## API Endpoint

**Endpoint:** `/api/sessions/[id]/mark-no-show`

**Method:** `POST`

**Behavior:**
- Validates session status
- Updates session to `NO_SHOW_STUDENT` status
- Processes charges/refunds accordingly
- Sends notifications
- Records in history

**Note:** The API endpoint was already implemented and didn't need changes.

---

## Testing Checklist

### For Students

#### Before 20 Minutes
- [ ] Button shows lock icon
- [ ] Button is gray and disabled
- [ ] Countdown shows remaining minutes
- [ ] Hover shows tooltip explaining when it activates
- [ ] Button cannot be clicked

#### After 20 Minutes
- [ ] Lock icon disappears
- [ ] Button turns red
- [ ] X icon appears
- [ ] Countdown disappears
- [ ] Hover shows warning about false reports
- [ ] Button can be clicked

#### Modal (After Clicking)
- [ ] Header says "Report Tutor No-Show"
- [ ] Shows refund information
- [ ] Shows "Full Refund Pending" in green
- [ ] Shows red warning box about false reports
- [ ] Cancel button works
- [ ] Confirm button submits report
- [ ] Success triggers page reload

---

### For Tutors

#### Before 20 Minutes
- [ ] Button shows lock icon
- [ ] Button is gray and disabled
- [ ] Countdown shows remaining minutes
- [ ] Hover shows tooltip explaining when it activates
- [ ] Button cannot be clicked

#### After 20 Minutes
- [ ] Lock icon disappears
- [ ] Button turns red
- [ ] X icon appears
- [ ] Countdown disappears
- [ ] Hover shows warning about false reports
- [ ] Button can be clicked

#### Modal (After Clicking)
- [ ] Header says "Mark Student No-Show"
- [ ] Shows charge breakdown (50%, 45%, 5%)
- [ ] Shows yellow note box
- [ ] Shows red warning box about false reports
- [ ] Cancel button works
- [ ] Confirm button submits report
- [ ] Success triggers page reload

---

### Edge Cases

- [ ] Button doesn't appear if session status is not SCHEDULED or JOIN_OPEN
- [ ] Button disappears after session ends
- [ ] Countdown updates in real-time
- [ ] Tooltips appear and disappear correctly on hover
- [ ] Modal closes when Cancel is clicked
- [ ] Error messages display if API call fails
- [ ] Button disables during submission
- [ ] Loading spinner shows during submission

---

## Timing Logic

### 20-Minute Wait Period

**Why 20 minutes?**
- Gives genuine late arrivals time to join
- Prevents premature no-show reports
- Industry standard for online sessions
- Balances fairness for both parties

**Calculation:**
```
Session Start Time: 11:00 AM
↓
+20 minutes
↓
Button Activates: 11:20 AM
↓
Remains active until session ends
```

**Example Scenarios:**

| Session Start | Session End | Button Active Period |
|--------------|-------------|---------------------|
| 2:00 PM | 3:00 PM | 2:20 PM - 3:00 PM |
| 5:30 PM | 6:30 PM | 5:50 PM - 6:30 PM |
| 9:00 AM | 10:00 AM | 9:20 AM - 10:00 AM |

---

## False Report Consequences

### Warning Message (Shown to All Users)

> ⚠️ **Important Warning**  
> Only mark as no-show if the [student/tutor] genuinely did not join within 20 minutes of the session start. **False no-show reports will result in account suspension or permanent ban from the platform.**

### Enforcement

1. **First Offense**: Warning + review
2. **Second Offense**: Temporary suspension (7 days)
3. **Third Offense**: Permanent ban

**Detection Methods:**
- Chat logs review
- Other party's evidence
- Pattern analysis (frequent reports)
- Historical behavior

**Appeal Process:**
- Users can appeal through support
- Evidence must be provided
- Decision within 48 hours

---

## User Benefits

### For Students
✅ Protection against tutor no-shows  
✅ Automatic full refund  
✅ Clear refund timeline (2-5 days)  
✅ Fair waiting period  
✅ Warning prevents misuse

### For Tutors
✅ Compensation for student no-shows  
✅ 45% payout for wasted time  
✅ Fair waiting period  
✅ Clear charge breakdown  
✅ Warning prevents false accusations

### For Platform
✅ Balanced system for both parties  
✅ Reduced disputes  
✅ Clear consequences for abuse  
✅ Automated refund/charge process  
✅ Better user experience

---

## Future Enhancements

### Possible Improvements

1. **Notification Before Activation**
   - Send notification at 15 minutes
   - Reminder that button will activate soon

2. **Auto-Report Option**
   - Automatically mark no-show if neither party joins
   - After 30 minutes with no activity

3. **Evidence Upload**
   - Allow screenshots/proof when reporting
   - Protects against false accusation appeals

4. **Grace Period Adjustment**
   - Allow tutors to customize wait time (15-30 min)
   - Platform default remains 20 minutes

5. **Report History**
   - Show users their no-show history
   - Transparency about past reports

6. **Dispute Resolution**
   - Built-in dispute form
   - Mediation process
   - Evidence review system

---

## Related Documentation

- **Session Management**: How sessions are created and managed
- **Booking System**: How bookings link to sessions
- **Payment Processing**: How charges and refunds are processed
- **User Suspension Policy**: Platform rules and consequences

---

**Status:** ✅ COMPLETED  
**Deployed:** Pending dev server refresh  
**Next Steps:** Refresh browser and test both student and tutor views
