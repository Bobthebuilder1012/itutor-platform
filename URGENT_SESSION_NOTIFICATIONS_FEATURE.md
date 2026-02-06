# Urgent Session Notifications Feature

## Overview

The session reminder system now includes **urgent notification logic** to ensure students and tutors receive timely reminders even if sessions are booked very close to their start time.

## How It Works

### Two-Window Approach

The Edge Function (`session-reminder-10-min`) now checks two time windows:

1. **Regular Window (9-11 minutes ahead)**
   - Standard case: Session starts in ~10 minutes
   - Sends normal 10-minute reminder

2. **Urgent Window (0-10 minutes ahead)**
   - Catch-up case: Session starts soon but no notification was sent
   - Checks if notification already exists in `notifications_log`
   - Only sends if no prior notification exists

### Use Cases

This urgent notification logic handles several scenarios:

1. **Last-Minute Bookings**
   - Student books a session 5 minutes before it starts
   - Tutor accepts immediately
   - Both receive notification right away (instead of missing it)

2. **System Downtime Recovery**
   - Edge Function was temporarily unavailable
   - When it comes back online, catches sessions starting soon
   - Ensures notifications are sent even if the normal 10-minute window was missed

3. **Rapid Booking Flow**
   - Tutor creates and confirms a session very quickly
   - Session is scheduled to start in 8 minutes
   - Notification is sent immediately when Edge Function next runs

## Technical Implementation

### Idempotency

The system prevents duplicate notifications using:
- `notifications_log` table with unique constraint: `(user_id, session_id, type)`
- Atomic insert with `ignoreDuplicates: true`
- If notification was already sent, insert fails silently

### Query Logic

```typescript
// Check sessions starting NOW to +10 minutes
const urgentWindowStart = now;
const urgentWindowEnd = new Date(now.getTime() + 10 * 60 * 1000);

// Get sessions in urgent window
const urgentSessions = await supabase
  .from('sessions')
  .select('id, scheduled_start_at, student_id, tutor_id')
  .eq('status', 'SCHEDULED')
  .gt('scheduled_start_at', iso(urgentWindowStart))
  .lt('scheduled_start_at', iso(urgentWindowEnd));

// Check which ones haven't been notified
const existingLogs = await supabase
  .from('notifications_log')
  .select('session_id')
  .in('session_id', urgentSessionIds)
  .eq('type', 'SESSION_REMINDER_10_MIN');

// Only notify unnotified sessions
const unnotifiedUrgentSessions = urgentSessionRows.filter(
  s => !notifiedSessionIds.has(s.id)
);
```

### Edge Function Schedule

The Edge Function should run **every 1-2 minutes** to ensure:
- Regular 10-minute reminders are sent on time
- Urgent notifications catch sessions within 0-10 minute window
- Minimal delay between booking and notification

## Response Format

The Edge Function now returns:

```json
{
  "ok": true,
  "processedSessions": 5,
  "urgentSessions": 2,
  "logged": 10,
  "tokens": 8,
  "sendsAttempted": 16,
  "durationMs": 1234
}
```

- `processedSessions`: Total unique sessions notified (regular + urgent)
- `urgentSessions`: How many sessions were caught in the urgent window
- `logged`: New notification log entries created
- `tokens`: Push tokens found for recipients
- `sendsAttempted`: FCM messages sent

## Monitoring

### Check for Urgent Notifications

```sql
-- Sessions starting soon without notifications
SELECT 
  s.id,
  s.scheduled_start_at,
  s.student_id,
  s.tutor_id,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start
FROM sessions s
LEFT JOIN notifications_log nl 
  ON nl.session_id = s.id 
  AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.status = 'SCHEDULED'
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '10 minutes'
  AND nl.id IS NULL
ORDER BY s.scheduled_start_at ASC;
```

### Check Notification Success Rate

```sql
-- Sessions vs notifications sent
SELECT 
  COUNT(DISTINCT s.id) as total_sessions,
  COUNT(DISTINCT nl.session_id) as notified_sessions,
  ROUND(100.0 * COUNT(DISTINCT nl.session_id) / NULLIF(COUNT(DISTINCT s.id), 0), 2) as notification_rate
FROM sessions s
LEFT JOIN notifications_log nl 
  ON nl.session_id = s.id 
  AND nl.type = 'SESSION_REMINDER_10_MIN'
WHERE s.scheduled_start_at > now() - interval '24 hours'
  AND s.status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');
```

## Testing

### Test Urgent Notification

1. Create a session starting in 5 minutes:
```sql
-- As service role
INSERT INTO sessions (
  id,
  student_id,
  tutor_id,
  scheduled_start_at,
  duration_minutes,
  status
) VALUES (
  gen_random_uuid(),
  '<student_uuid>',
  '<tutor_uuid>',
  now() + interval '5 minutes',
  60,
  'SCHEDULED'
);
```

2. Manually trigger Edge Function (or wait for next cron run)

3. Check if notification was sent:
```sql
SELECT * FROM notifications_log 
WHERE session_id = '<session_id>'
  AND type = 'SESSION_REMINDER_10_MIN';
```

4. Verify push notification was received on student and tutor devices

## Edge Function Deployment

Deploy the updated function:

```bash
npx supabase functions deploy session-reminder-10-min
```

Ensure cron schedule is set (in Supabase Dashboard → Edge Functions):
```
*/1 * * * *  # Every minute (recommended)
```

Or:
```
*/2 * * * *  # Every 2 minutes (acceptable)
```

## Benefits

✅ **No missed notifications** - Even last-minute bookings get reminders
✅ **System resilience** - Recovers from temporary downtime
✅ **Better UX** - Students and tutors never miss important session alerts
✅ **Idempotent** - Prevents duplicate notifications
✅ **Efficient** - Only checks unnotified sessions in urgent window
