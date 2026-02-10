# Apply Timezone Fix to Supabase

## Problem
Tutors are entering times like "9:00 AM - 5:00 PM" but students see slots starting at "5:00 AM, 6:00 AM, etc." This is a 4-hour offset caused by implicit UTC conversion.

## Solution
The `FIX_TIMEZONE_AVAILABILITY.sql` file contains the corrected SQL function that properly handles Trinidad timezone (UTC-4).

## How to Apply

### Option 1: Supabase SQL Editor (Recommended)
1. Go to https://supabase.com/dashboard/project/nfkrfciozjxrodkusrhh
2. Click on "SQL Editor" in the left sidebar
3. Click "New query"
4. Copy the entire contents of `FIX_TIMEZONE_AVAILABILITY.sql`
5. Paste it into the SQL editor
6. Click "Run" (or press Ctrl+Enter)
7. You should see: "Success. No rows returned"

### Option 2: Using Supabase CLI (if installed)
```bash
npx supabase db execute --file FIX_TIMEZONE_AVAILABILITY.sql --project-ref nfkrfciozjxrodkusrhh
```

### Option 3: Direct Database Connection (if you have psql installed)
```bash
psql "postgresql://postgres.nfkrfciozjxrodkusrhh:[YOUR_DB_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -f FIX_TIMEZONE_AVAILABILITY.sql
```

## What This Fix Does
- Changes the `get_tutor_public_calendar` function to explicitly interpret times in `America/Port_of_Spain` timezone
- Before: `(date + time)::timestamptz` → assumes UTC
- After: `((date || ' ' || time)::timestamp AT TIME ZONE 'America/Port_of_Spain')::timestamptz` → correctly interprets as local time

## Testing
After applying:
1. Refresh the student's "Find Tutors" page
2. Click on a tutor with availability set at 9:00 AM - 5:00 PM
3. Verify the calendar shows slots at 9:00 AM, 10:00 AM, 11:00 AM, etc. (not 5:00 AM, 6:00 AM)

## Rollback (if needed)
If there are any issues, you can find the original function in:
`src/supabase/migrations/012_booking_functions.sql`
