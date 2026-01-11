# 🧪 Sessions System Testing Guide

## ✅ Database Installation Complete!

The sessions system is now fully installed in your database with:
- ✅ `sessions` table
- ✅ `session_events` table  
- ✅ `tutor_video_provider_connections` table
- ✅ RLS policies
- ✅ Triggers & helper functions

---

## 🧪 How to Test

### 1️⃣ Test Session Creation

**Prerequisites:**
- Have a confirmed booking (booking with status = 'CONFIRMED')
- Booking must have `confirmed_start_at` and `confirmed_end_at` set

**Steps:**
1. Create a test booking or use an existing confirmed one
2. Call the session creation API:

```bash
curl -X POST http://localhost:3000/api/sessions/create-for-booking \
  -H "Content-Type: application/json" \
  -d '{"booking_id": "YOUR_BOOKING_ID"}'
```

**Expected Result:**
- New session created with status `SCHEDULED`
- `scheduled_start_at` and `scheduled_end_at` set from booking
- `no_show_wait_minutes` and `min_payable_minutes` calculated (33% and 66% of duration)
- `charge_scheduled_at` set to the end time

---

### 2️⃣ Test Join Button UI

**Prerequisites:**
- Have a session scheduled within the next 6 minutes (or past that time)

**Steps:**
1. Go to a session detail page as student or tutor
2. Add the `SessionJoinButton` component:

```tsx
import SessionJoinButton from '@/components/sessions/SessionJoinButton';

<SessionJoinButton 
  session={sessionData} 
  userRole="student" // or "tutor"
/>
```

**Expected Behavior:**
- **Before 5 min window:** Shows countdown timer
- **During 5 min window (5 min before start):** Shows "Join Session Now" button
- **Clicking button:** Opens meeting link in new tab

---

### 3️⃣ Test No-Show Feature (Tutor)

**Prerequisites:**
- Session status is `JOIN_OPEN`
- Current time is past `scheduled_start_at + no_show_wait_minutes`
- Tutor has joined the session (`meeting_started_at` is set)

**Steps:**
1. Add the `MarkNoShowButton` component to tutor's session view:

```tsx
import MarkNoShowButton from '@/components/sessions/MarkNoShowButton';

<MarkNoShowButton 
  session={sessionData}
  onSuccess={() => {
    // Refresh session data
    router.refresh();
  }}
/>
```

2. Click "End & Mark Student No-Show"
3. Review the modal showing charges
4. Click "Confirm No-Show"

**Expected Result:**
- Session status changes to `NO_SHOW_STUDENT`
- Student charged 50% of original price
- Tutor receives 45% payout
- Platform takes 5% fee
- `charged_at` timestamp set

---

### 4️⃣ Test Automatic Charging (Cron)

**Prerequisites:**
- Have a session where `charge_scheduled_at` is in the past
- Session status is `SCHEDULED` or `JOIN_OPEN`
- Session has NOT been charged yet (`charged_at` is NULL)

**Steps:**
1. Set up the cron secret in `.env.local`:

```env
CRON_SECRET=your_secret_key_here
```

2. Manually trigger the cron job:

```bash
curl -X GET http://localhost:3000/api/cron/process-charges \
  -H "Authorization: Bearer your_secret_key_here"
```

**Expected Result:**
- All eligible sessions are processed
- Status changes to `COMPLETED_ASSUMED`
- Full charge applied
- Tutor receives 90% payout
- Platform takes 10% fee

---

## 🔍 Database Queries for Testing

### Check Session Status
```sql
SELECT 
  id,
  booking_id,
  status,
  scheduled_start_at,
  scheduled_end_at,
  duration_minutes,
  no_show_wait_minutes,
  min_payable_minutes,
  charge_amount_ttd,
  payout_amount_ttd,
  charged_at
FROM public.sessions
ORDER BY created_at DESC
LIMIT 10;
```

### Check Sessions Ready to Charge
```sql
SELECT 
  id,
  booking_id,
  status,
  charge_scheduled_at,
  NOW() - charge_scheduled_at as overdue_by
FROM public.sessions
WHERE charged_at IS NULL
  AND charge_scheduled_at < NOW()
ORDER BY charge_scheduled_at ASC;
```

### Test Helper Functions
```sql
-- Test session rules calculation
SELECT * FROM calculate_session_rules(40); -- 40 minute session
-- Should return: no_show_wait=13, min_payable=26

-- Test join window
SELECT is_join_window_open(NOW() + INTERVAL '10 minutes'); -- false
SELECT is_join_window_open(NOW() + INTERVAL '4 minutes');  -- true
SELECT is_join_window_open(NOW() - INTERVAL '5 minutes');  -- true
```

---

## 📊 Session Status Flow

```
SCHEDULED
  ↓ (5 min before start)
JOIN_OPEN
  ↓
  ├─→ [Student joins] → Session proceeds
  ├─→ [Student no-show] → NO_SHOW_STUDENT (tutor marks)
  ├─→ [Ends early] → EARLY_END_SHORT (manual)
  └─→ [Time expires] → COMPLETED_ASSUMED (auto-charge)
```

---

## 🚨 Common Issues

### Issue: "Session not creating"
**Solution:** Check that the booking has `confirmed_start_at` and `confirmed_end_at` set (not NULL)

### Issue: "Join button not appearing"
**Solution:** Check that current time is within 5 minutes of `scheduled_start_at`

### Issue: "Can't mark no-show"
**Solution:** Ensure enough time has passed (`scheduled_start_at + no_show_wait_minutes`)

### Issue: "Cron not running"
**Solution:** Check Vercel cron logs or manually trigger with correct auth header

---

## 🎯 Next Steps

1. **Deploy to Vercel:** The cron job will automatically run every minute
2. **Connect Video Providers:** Implement Google Meet / Zoom OAuth
3. **Add Session UI:** Integrate components into session detail pages
4. **Monitor Charges:** Set up alerts for failed charges
5. **Add Notifications:** Notify users when sessions are charged

---

## 📝 Notes

- **Timezone:** All times stored as UTC, assumes America/Port_of_Spain for display
- **Currency:** All amounts in TTD (Trinidad and Tobago Dollars)
- **Cron Frequency:** Runs every minute (see `vercel.json`)
- **RLS:** Users can only see their own sessions (student_id or tutor_id)

---

Need help? Check `SESSIONS_SYSTEM_README.md` for full technical details! 🚀












