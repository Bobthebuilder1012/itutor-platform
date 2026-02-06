# Session Status and Notification Timing Explained

## Point 4: "Session status changed - If status is JOIN_OPEN instead of SCHEDULED, notification was already sent earlier"

### Understanding Session Statuses

Sessions in iTutor go through different statuses as they progress:

```
SCHEDULED → JOIN_OPEN → (various ending states)
```

### Status Breakdown

#### 1. **SCHEDULED** (Initial state)
- **When**: Session is confirmed and created in the database
- **Meaning**: The session is scheduled but not yet ready to join
- **Time**: From creation until 5 minutes before start time
- **Notifications**: ✅ 10-minute reminder is sent when in this state

#### 2. **JOIN_OPEN** (Ready to join)
- **When**: 5 minutes before the session starts
- **Meaning**: Meeting link is active and participants can join
- **Time**: From 5 minutes before start until session ends
- **Notifications**: ❌ 10-minute reminder NOT sent (already sent earlier)

#### 3. **COMPLETED_ASSUMED** (Session finished)
- **When**: After the scheduled end time
- **Meaning**: Session ended normally (assumed)

#### 4. **NO_SHOW_STUDENT** (Student didn't show up)
- **When**: Tutor marks student as no-show after waiting period
- **Meaning**: Student didn't join the session

#### 5. **CANCELLED** (Session cancelled)
- **When**: Either tutor or system cancels the session
- **Meaning**: Session won't happen

---

## Why This Matters for Notifications

### The 10-Minute Reminder Logic

The Edge Function that sends 10-minute reminders runs **every minute** and:

1. **Finds sessions** where:
   - `scheduled_start_at` is between `now() + 9 minutes` and `now() + 11 minutes`
   - `status = 'SCHEDULED'` ✅ (IMPORTANT!)

2. **Sends notifications** to both student and tutor

3. **Records in `notifications_log`** to prevent duplicates

### Timeline Example

Let's say you have a session scheduled for **2:00 PM**:

| Time | Session Status | 10-Min Reminder Sent? | Why? |
|------|---------------|----------------------|------|
| 1:40 PM | SCHEDULED | ❌ No | Too early (20 minutes before) |
| 1:45 PM | SCHEDULED | ❌ No | Too early (15 minutes before) |
| 1:49 PM | SCHEDULED | ❌ No | Too early (11 minutes before) |
| **1:50 PM** | **SCHEDULED** | **✅ YES** | **In the 9-11 minute window** |
| 1:51 PM | SCHEDULED | ✅ Already sent | Duplicate prevented by `notifications_log` |
| 1:54 PM | SCHEDULED | ✅ Already sent | Duplicate prevented |
| 1:55 PM | **JOIN_OPEN** | ✅ Already sent | Status changed to allow joining |
| 2:00 PM | JOIN_OPEN | ✅ Already sent | Session started |

### What Happens if Status Changes Too Early?

**Scenario**: Session status changes from `SCHEDULED` to `JOIN_OPEN` at **1:48 PM** (12 minutes before start)

| Time | Session Status | 10-Min Reminder Sent? | Why? |
|------|---------------|----------------------|------|
| 1:48 PM | **JOIN_OPEN** | ❌ No | Status changed early |
| 1:50 PM | JOIN_OPEN | ❌ **MISSED** | Status is not SCHEDULED anymore |
| 1:55 PM | JOIN_OPEN | ❌ Missed | Too late |
| 2:00 PM | JOIN_OPEN | ❌ Missed | Session started |

**Result**: ❌ NO 10-MINUTE REMINDER SENT because the status was not `SCHEDULED` during the 9-11 minute window.

---

## How to Check if This is Your Issue

### Run this SQL query:

```sql
-- Check sessions that should have gotten reminders in the last 30 minutes
SELECT 
    s.id,
    s.status,
    s.scheduled_start_at,
    s.created_at,
    EXTRACT(EPOCH FROM (s.scheduled_start_at - s.created_at)) / 60 as minutes_from_creation_to_start,
    CASE 
        WHEN s.status = 'SCHEDULED' THEN '✅ Should get reminder'
        WHEN s.status = 'JOIN_OPEN' THEN '⚠️ Status changed - check notifications_log'
        ELSE '❌ Wrong status for reminders'
    END as reminder_status
FROM sessions s
WHERE s.scheduled_start_at >= now() - interval '30 minutes'
AND s.scheduled_start_at <= now() + interval '30 minutes'
ORDER BY s.scheduled_start_at DESC;
```

### Check if notification was sent:

```sql
-- Check if notification exists in log
SELECT 
    nl.user_id,
    p.full_name,
    nl.session_id,
    nl.type,
    nl.created_at as notification_sent_at,
    s.scheduled_start_at,
    s.status as session_status,
    EXTRACT(EPOCH FROM (s.scheduled_start_at - nl.created_at)) / 60 as minutes_before_session
FROM notifications_log nl
JOIN profiles p ON nl.user_id = p.id
JOIN sessions s ON nl.session_id = s.id
WHERE nl.type = 'session_reminder_10_min'
AND s.scheduled_start_at >= now() - interval '1 hour'
ORDER BY nl.created_at DESC;
```

---

## Common Issues and Fixes

### Issue 1: Session created less than 10 minutes before start time

**Example**: You create a session at 1:55 PM for 2:00 PM (only 5 minutes before)

**Result**: ❌ No 10-minute reminder (because there was never a time when it was 10 minutes away)

**Fix**: Create sessions at least 15 minutes in advance to ensure the reminder can be sent

### Issue 2: Status changes from SCHEDULED to JOIN_OPEN too early

**Example**: System changes status to JOIN_OPEN at 1:48 PM (12 minutes before) instead of 1:55 PM (5 minutes before)

**Result**: ❌ No reminder sent (status was not SCHEDULED during the 9-11 minute window)

**Fix**: Check the `updateJoinWindowStatus()` function - it should only run 5 minutes before start, not earlier

### Issue 3: Edge Function not scheduled or not running

**Symptoms**:
- No entries in `notifications_log` for any sessions
- No errors in Supabase logs

**Fix**: 
1. Verify Edge Function is deployed: `supabase functions list`
2. Check Edge Function schedule is set to `* * * * *` (every minute)
3. Check Edge Function logs for errors

### Issue 4: Duplicate prevention working too well

**Symptoms**:
- First notification sent successfully
- No notifications for subsequent sessions

**Check**:
```sql
-- Check if notifications_log has entries blocking new notifications
SELECT * FROM notifications_log 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;
```

**Fix**: The system is working correctly - each session should only get ONE 10-minute reminder

---

## Best Practices

1. ✅ **Create sessions at least 15 minutes in advance**
2. ✅ **Test with sessions scheduled 10-15 minutes from now**
3. ✅ **Check `notifications_log` table to confirm delivery**
4. ✅ **Monitor Edge Function logs** for errors
5. ✅ **Verify session status is SCHEDULED** during the 9-11 minute window
