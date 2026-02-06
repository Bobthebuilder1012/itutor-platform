# 10-Minute Notification Troubleshooting - Quick Guide

## Quick Checklist ✅

Run through these steps in order:

### 1. Check if FCM Service Account is Set
- [ ] Go to Firebase Console → Project Settings → Service Accounts
- [ ] Download service account JSON key
- [ ] Add to Supabase: Edge Functions → Configuration → Secrets
- [ ] Secret name: `FCM_SERVICE_ACCOUNT_JSON`
- [ ] Secret value: Paste entire JSON content
- [ ] Redeploy Edge Function: `supabase functions deploy session-reminder-10-min`

**📄 Detailed guide**: `GET_FCM_SERVICE_ACCOUNT_GUIDE.md`

---

### 2. Check Browser Notification Permission
- [ ] Open iTutor website
- [ ] Click lock icon 🔒 in address bar
- [ ] Check if "Notifications" is set to "Allow"
- [ ] If blocked: Site Settings → Notifications → Change to "Allow"
- [ ] Reload page and log in again

**📄 Detailed guide**: `FIX_BROWSER_NOTIFICATION_PERMISSION.md`

---

### 3. Verify Push Token is Registered

Run this SQL in Supabase:
```sql
SELECT 
    pt.user_id,
    p.full_name,
    p.email,
    pt.platform,
    pt.token IS NOT NULL as has_token,
    pt.created_at,
    pt.last_used_at
FROM push_tokens pt
JOIN profiles p ON pt.user_id = p.id
WHERE p.email = 'YOUR_EMAIL@example.com';
```

**Expected result**: One row with `has_token = true` and `platform = 'web'`

**If no token**: Browser permission was denied or Firebase config is missing

---

### 4. Check Session Status During 10-Minute Window

Run this SQL to see if sessions were in correct status:
```sql
-- Shows sessions and their status 10 minutes before start
SELECT 
    s.id,
    s.status,
    s.scheduled_start_at,
    s.scheduled_start_at AT TIME ZONE 'America/Port_of_Spain' as local_time,
    EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_session,
    p_student.full_name as student_name,
    p_tutor.full_name as tutor_name
FROM sessions s
JOIN profiles p_student ON s.student_id = p_student.id
JOIN profiles p_tutor ON s.tutor_id = p_tutor.id
WHERE s.scheduled_start_at >= now() - interval '30 minutes'
AND s.scheduled_start_at <= now() + interval '30 minutes'
ORDER BY s.scheduled_start_at DESC;
```

**What to look for**:
- ✅ Status should be `SCHEDULED` between 9-11 minutes before start
- ❌ If status is `JOIN_OPEN` too early, notification was missed

**📄 Detailed explanation**: `SESSION_STATUS_EXPLANATION.md`

---

### 5. Check Notification Log

Run this SQL to see if notification was sent:
```sql
SELECT 
    nl.user_id,
    p.full_name,
    p.email,
    nl.session_id,
    nl.type,
    nl.created_at as notification_sent_at,
    s.scheduled_start_at,
    EXTRACT(EPOCH FROM (s.scheduled_start_at - nl.created_at)) / 60 as minutes_before_session
FROM notifications_log nl
JOIN profiles p ON nl.user_id = p.id
LEFT JOIN sessions s ON nl.session_id = s.id
WHERE nl.type = 'session_reminder_10_min'
AND nl.created_at >= now() - interval '2 hours'
ORDER BY nl.created_at DESC;
```

**Expected**: One row per user (student + tutor) for each session, ~10 minutes before start

**If missing**: Either Edge Function didn't run, or session status was wrong

---

### 6. Verify Edge Function is Scheduled

**Via Supabase Dashboard**:
1. Go to Edge Functions
2. Click on `session-reminder-10-min`
3. Go to "Schedules" or "Configuration" tab
4. Verify schedule is set to: `* * * * *` (every minute)

**Via CLI**:
```bash
supabase functions list
```

Should show `session-reminder-10-min` as deployed

---

### 7. Check Edge Function Logs

**Via Supabase Dashboard**:
1. Edge Functions → `session-reminder-10-min` → Logs
2. Look for recent invocations (should be every minute)
3. Check for errors

**Expected log output**:
```json
{
  "ok": true,
  "processedSessions": 1,
  "logged": 2,
  "tokens": 2,
  "sendsAttempted": 2,
  "durationMs": 1234
}
```

**If errors**: Check FCM credentials and session status

---

## Common Issues and Solutions

### ❌ "No token registered"
**Cause**: Browser notification permission denied or Firebase config missing

**Fix**: 
1. Check browser notification settings (see `FIX_BROWSER_NOTIFICATION_PERMISSION.md`)
2. Verify Firebase env vars are set in hosting provider (Vercel/Netlify)
3. Clear browser cache and try again

---

### ❌ "Notification log is empty"
**Cause**: Edge Function not running or not scheduled

**Fix**:
1. Check Edge Function is deployed: `supabase functions list`
2. Verify schedule is set to `* * * * *`
3. Check Edge Function logs for errors
4. Verify `FCM_SERVICE_ACCOUNT_JSON` secret is set

---

### ❌ "Session status is JOIN_OPEN during notification window"
**Cause**: Status changed from SCHEDULED to JOIN_OPEN too early (>5 min before start)

**Explanation**: 
- 10-minute reminder only sent when status = `SCHEDULED`
- If status changes to `JOIN_OPEN` before 9-11 minute window, notification is skipped
- Normal behavior: status changes to `JOIN_OPEN` at 5 minutes before start

**Fix**: 
- This is working as designed
- Create sessions at least 15 minutes in advance
- Check `updateJoinWindowStatus()` function to ensure it runs at correct time

**📄 Full explanation**: `SESSION_STATUS_EXPLANATION.md`

---

### ❌ "Notification sent but not received on device"
**Cause**: Service worker not registered or Firebase misconfigured

**Fix**:
1. Open DevTools (F12) → Application → Service Workers
2. Verify `/firebase-messaging-sw.js` is registered and active
3. Check browser console for Firebase errors
4. Test notification permission:
   ```javascript
   Notification.requestPermission().then(console.log);
   ```

---

## Testing the Full Flow

### Test Scenario: Create a session 12 minutes from now

1. **Create a test session**:
   ```sql
   -- Replace UUIDs with your actual IDs
   INSERT INTO sessions (
       tutor_id,
       student_id,
       scheduled_start_at,
       scheduled_end_at,
       duration_minutes,
       provider,
       status,
       charge_amount_ttd,
       payout_amount_ttd,
       platform_fee_ttd
   ) VALUES (
       'TUTOR_UUID',
       'STUDENT_UUID',
       now() + interval '12 minutes',
       now() + interval '72 minutes',
       60,
       'google_meet',
       'SCHEDULED',
       100,
       90,
       10
   );
   ```

2. **Wait 2-3 minutes** (until session is ~10 minutes away)

3. **Check notification log**:
   ```sql
   SELECT * FROM notifications_log 
   WHERE type = 'session_reminder_10_min'
   ORDER BY created_at DESC LIMIT 5;
   ```

4. **Check browser notification** (should appear as desktop notification)

5. **Verify in Edge Function logs** (should show 2 notifications sent)

---

## Need More Help?

📄 **Detailed Guides**:
- `GET_FCM_SERVICE_ACCOUNT_GUIDE.md` - How to get Firebase service account key
- `FIX_BROWSER_NOTIFICATION_PERMISSION.md` - Fix browser permission issues
- `SESSION_STATUS_EXPLANATION.md` - Understand session statuses and timing
- `DEBUG_10MIN_NOTIFICATIONS.sql` - SQL queries to debug notifications
- `PUSH_REMINDERS_SETUP.md` - Original setup documentation

🔍 **Debug Tools**:
- Firebase Console: https://console.firebase.google.com
- Supabase Dashboard: Your project URL
- Browser DevTools: F12 → Console / Application tabs
