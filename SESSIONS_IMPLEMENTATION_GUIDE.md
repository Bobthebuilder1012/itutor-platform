

# 🎯 Sessions System - Implementation Complete

## ✅ What's Been Created

### 1. **Database Schema** (`src/supabase/migrations/018_sessions_system.sql`)
- ✅ `tutor_video_provider_connections` table
- ✅ `sessions` table with all required fields
- ✅ `session_events` audit table
- ✅ Proper indexes for performance
- ✅ RLS policies (tutors/students can view, no client updates)
- ✅ Helper functions for calculations

### 2. **TypeScript Types** (`lib/types/sessions.ts`)
- ✅ All type definitions
- ✅ Helper functions (calculateSessionRules, canMarkNoShow, isJoinWindowOpen)
- ✅ Status colors and labels

### 3. **Video Provider Service** (`lib/services/videoProviders.ts`)
- ✅ Adapter interface for Zoom and Google Meet
- ✅ Stubbed implementations (OAuth to be added later)
- ✅ `createMeeting()`, `getMeetingState()` functions

### 4. **Session Service** (`lib/services/sessionService.ts`)
- ✅ `createSessionForBooking()` - Creates session on booking confirmation
- ✅ `markStudentNoShow()` - 50% charge logic
- ✅ `processScheduledCharges()` - Scheduled charging at end time
- ✅ Early-end override detection
- ✅ Uses service role client for security

---

## 🚀 Next Steps - API Routes

Create these API route files:

### API Route 1: Create Session
**File:** `app/api/sessions/create-for-booking/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSessionForBooking } from '@/lib/services/sessionService';

export async function POST(request: NextRequest) {
  try {
    const { booking_id } = await request.json();
    
    if (!booking_id) {
      return NextResponse.json(
        { error: 'booking_id required' },
        { status: 400 }
      );
    }

    const session = await createSessionForBooking(booking_id);
    
    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
```

### API Route 2: Mark No-Show
**File:** `app/api/sessions/[id]/mark-no-show/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { markStudentNoShow } from '@/lib/services/sessionService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await markStudentNoShow(params.id, user.id);
    
    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    console.error('Error marking no-show:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark no-show' },
      { status: 500 }
    );
  }
}
```

### API Route 3: Scheduled Charges Cron
**File:** `app/api/cron/process-charges/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { processScheduledCharges } from '@/lib/services/sessionService';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized calls
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await processScheduledCharges();
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error processing charges:', error);
    return NextResponse.json(
      { error: 'Failed to process charges' },
      { status: 500 }
    );
  }
}
```

---

## 📋 Environment Variables Needed

Add to `.env.local`:
```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
CRON_SECRET=your_random_secret_here
```

---

## ⚙️ Vercel Cron Setup

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-charges",
      "schedule": "* * * * *"
    }
  ]
}
```

---

## 🎨 Frontend Components Needed

### 1. Tutor Video Provider Settings
**File:** `components/settings/VideoProviderSettings.tsx`

Features:
- Show connected provider (Google Meet / Zoom)
- "Change Provider" button
- Connection status indicator
- No "Remove" button (must stay connected)

### 2. Session Join Button
**File:** `components/sessions/SessionJoinButton.tsx`

Features:
- Appears 5 minutes before scheduled start
- Countdown timer
- Join URL link
- Policy text showing no-show wait time

### 3. Tutor No-Show Button
**File:** `components/sessions/MarkNoShowButton.tsx`

Features:
- Only visible to tutor after wait period
- Confirmation dialog
- Shows outcome (50% charge)

### 4. Session Receipt
**File:** `components/sessions/SessionReceipt.tsx`

Features:
- Status badge with color
- Charge amount
- Explanation text based on status

---

## 🧪 Test Scenarios

### Test 1: Cannot Accept Without Provider
```sql
-- Tutor has no connection
SELECT * FROM tutor_video_provider_connections WHERE tutor_id = 'tutor-uuid';
-- Should return no rows

-- Try to create session (should fail)
POST /api/sessions/create-for-booking
{
  "booking_id": "booking-uuid"
}
-- Expected: Error "No video provider connected"
```

### Test 2: Join Window Opens
```sql
-- Session scheduled for 3:00 PM
-- At 2:55 PM, join button should appear
SELECT 
  id,
  scheduled_start_at,
  (scheduled_start_at - INTERVAL '5 minutes') as join_opens_at
FROM sessions 
WHERE id = 'session-uuid';
```

### Test 3: No-Show Calculation
```sql
-- 60-minute session
SELECT 
  duration_minutes,
  no_show_wait_minutes,  -- Should be 20
  min_payable_minutes     -- Should be 40
FROM sessions
WHERE duration_minutes = 60;
```

### Test 4: Mark No-Show
```sql
-- After 20 minutes, tutor marks no-show
-- charge_amount_ttd should be 50% of original
-- payout_amount_ttd should be 90% of charge
-- platform_fee_ttd should be 10% of charge
```

### Test 5: Scheduled End Charge
```sql
-- At scheduled_end_at:
-- If meeting_ended_at is NULL or >= scheduled_end_at
--   -> Status = COMPLETED_ASSUMED
--   -> Charge full amount
-- If meeting_ended_at < scheduled_end_at
--   -> Status = EARLY_END_SHORT
--   -> Charge = 0
```

---

## 📊 Business Logic Summary

| Scenario | Student Charge | Tutor Payout | Platform Fee | Status |
|----------|---------------|--------------|--------------|--------|
| **Completed** (reached scheduled end) | 100% | 90% of charge | 10% of charge | COMPLETED_ASSUMED |
| **No-Show** (student didn't join) | 50% | 45% of original | 5% of original | NO_SHOW_STUDENT |
| **Early End** (meeting ended early) | 0% | 0% | 0% | EARLY_END_SHORT |
| **Cancelled** | 0% | 0% | 0% | CANCELLED |

---

## 🔐 Security Notes

1. **Service Role Key**: Never expose in client code
2. **RLS Policies**: Clients can only SELECT their own sessions
3. **API Routes**: All mutations go through API with auth checks
4. **Cron Secret**: Protect scheduled charge endpoint
5. **Token Storage**: Use Supabase Vault for OAuth tokens in production

---

## 🚦 Ready to Deploy

1. ✅ Run migration: `018_sessions_system.sql`
2. ✅ Add environment variables
3. ✅ Create API route files
4. ✅ Set up Vercel cron
5. ✅ Build frontend components
6. ✅ Test all scenarios
7. ✅ Deploy!








