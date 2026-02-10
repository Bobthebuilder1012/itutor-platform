# Fix: Generate Missing Meeting Links

## Problem
When bookings are confirmed, sessions are created automatically by database trigger, but meeting links are NOT automatically generated. This leaves sessions stuck showing "Meeting link is being generated..." forever.

## Root Cause
The `auto_create_session_on_confirm()` trigger creates sessions but doesn't create meeting links because:
1. Meeting link creation requires calling external APIs (Google Meet/Zoom)
2. Database triggers cannot make external HTTP requests
3. The meeting creation needs tutor's encrypted OAuth tokens

## Solution

### Option 1: Run API Endpoint to Fix Existing Sessions (Quick Fix)

Call the endpoint that creates meeting links for all sessions without them:

```bash
# From your browser console or terminal
fetch('http://localhost:3000/api/sessions/create-missing-meetings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => console.log(data));
```

Or use the "Retry Now" button visible to tutors when viewing a session without a meeting link.

### Option 2: Automatic Generation via Edge Function (Permanent Solution)

We need to set up a Supabase Edge Function that automatically runs whenever a new session is created:

1. Create a Supabase Edge Function trigger
2. Listen for INSERT events on the `sessions` table
3. When a session is created without a `join_url`, call the meeting creation logic

### Option 3: Client-Side Polling (Simple Alternative)

Update the booking/session viewing pages to automatically retry meeting creation:

**For Student Booking Page:**
- After booking is confirmed, poll for session creation
- Once session exists, trigger meeting link creation
- Show real-time status updates

**For Session Details Page:**
- If `join_url` is NULL, automatically trigger retry
- Poll every 5 seconds until meeting link appears
- Show progress indicator

## Implementation Steps

### Step 1: Check Tutor Has Video Provider Connected

```sql
SELECT 
    t.id,
    t.full_name,
    t.email,
    vpc.provider,
    vpc.connection_status,
    vpc.token_expires_at
FROM profiles t
LEFT JOIN tutor_video_provider_connections vpc ON vpc.tutor_id = t.id
WHERE t.role = 'tutor'
ORDER BY t.full_name;
```

### Step 2: Find Sessions Without Meeting Links

```sql
SELECT 
    s.id AS session_id,
    s.booking_id,
    t.full_name AS tutor_name,
    st.full_name AS student_name,
    s.scheduled_start_at,
    s.provider,
    s.join_url,
    s.meeting_external_id,
    s.status
FROM sessions s
INNER JOIN profiles t ON t.id = s.tutor_id
INNER JOIN profiles st ON st.id = s.student_id
WHERE (s.join_url IS NULL OR s.meeting_external_id IS NULL)
    AND s.scheduled_start_at > NOW()
    AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
ORDER BY s.scheduled_start_at;
```

### Step 3: Create Meeting Links

#### Via API (Recommended):
Call `/api/sessions/create-missing-meetings` endpoint

#### Via Individual Session:
Call `/api/sessions/retry-meeting-link` with `sessionId`

## Frontend Updates Needed

### Update SessionJoinButton Component

Add automatic retry logic:

```typescript
useEffect(() => {
  if (!session.join_url && userRole === 'tutor' && !hasAttemptedRetry) {
    // Automatically try to create meeting link once
    setHasAttemptedRetry(true);
    handleRetryMeetingLink();
  }
}, [session.join_url]);
```

### Update Booking Confirmation Flow

After booking is confirmed, poll for session and trigger meeting creation:

```typescript
async function pollForSession(bookingId: string) {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const session = await getSessionByBookingId(bookingId);
    if (session) {
      if (!session.join_url) {
        await retryMeetingLink(session.id);
      }
      return session;
    }
    await sleep(2000); // Wait 2 seconds
  }
}
```

## Testing

1. Confirm a booking
2. Check that session is created
3. Verify meeting link is generated within a few seconds
4. Student and tutor should both see the "Join Meeting" button

## Monitoring

Add logging to track:
- How many sessions are created without meeting links
- Success/failure rate of automatic meeting creation
- Average time from session creation to meeting link generation

## Prevention

To prevent this issue in the future:
1. Implement Supabase Edge Function trigger
2. Add retry logic with exponential backoff
3. Send notification to tutor if meeting creation fails
4. Display clear error messages with action buttons
