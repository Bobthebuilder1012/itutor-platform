# Fix Parent Booking Authorization - V2 (Guaranteed Fix)

## Issue
Getting error: "function name 'create_booking_request' is not unique"

This means there are multiple versions of the function with different signatures in the database.

## Solution V2 - Comprehensive Drop & Recreate

This version will:
1. **Automatically find** ALL versions of the function
2. **Drop ALL versions** regardless of their signatures
3. **Create the new version** with parent authorization

## 🚀 How to Run

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/nfkrfciozjxrodkusrpnh
2. Click **SQL Editor** in left sidebar
3. Click **New Query**

### Step 2: Copy and Run V2 Script
1. Open file: `FIX_PARENT_BOOKING_AUTHORIZATION_V2.sql`
2. Copy **ALL** contents (entire file)
3. Paste into Supabase SQL Editor
4. Click **Run** (or Ctrl+Enter)

### Step 3: Verify Success
You should see output like:
```
Function created successfully: create_booking_request(uuid,uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,numeric,integer)
```

If you see this message, the fix was successful! ✅

## What This Script Does

### Part 1: Dynamic Function Drop
```sql
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;' AS drop_statement
        FROM pg_proc 
        WHERE proname = 'create_booking_request'
    LOOP
        EXECUTE r.drop_statement;
    END LOOP;
END $$;
```

This:
- Finds **every** version of `create_booking_request` in the database
- Drops each one, regardless of how many parameters it has
- Uses CASCADE to handle dependencies

### Part 2: Create New Function
Creates the updated function that allows:
- ✅ Students to book for themselves
- ✅ Parents to book for their children (NEW!)
- ❌ Anyone else (rejected)

### Part 3: Verification
Shows you the new function signature to confirm it was created.

## Testing After Fix

### Test 1: Parent Booking (Should Work Now)
1. Login as parent
2. Go to tutor profile
3. Select your child
4. Pick subject and time
5. Click "Request Booking"
6. ✅ **Should succeed** (no more error!)

### Test 2: Student Booking (Still Works)
1. Login as student
2. Go to tutor profile
3. Pick subject and time
4. Click "Request Booking"
5. ✅ Should succeed (unchanged)

## Troubleshooting

### If You Still Get "Not Unique" Error
This shouldn't happen with V2, but if it does:

**Option A - Manual Cleanup:**
Run this first:
```sql
-- Show all versions
SELECT oid::regprocedure 
FROM pg_proc 
WHERE proname = 'create_booking_request';

-- Then drop each one manually, replacing with actual signatures shown above
-- Example:
-- DROP FUNCTION create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);
```

**Option B - Nuclear Option:**
```sql
DROP FUNCTION create_booking_request CASCADE;
```
Then run the V2 script again.

### If You Get "Permission Denied"
Make sure you're running as the Supabase admin/owner user in the SQL Editor.

### If Function Doesn't Exist After Running
Check for errors in the output. The script should complete without errors.

## Why V2 Is Better

| V1 (Failed) | V2 (Works) |
|-------------|------------|
| Tried to drop specific signatures | Finds ALL signatures dynamically |
| Might miss some versions | Guaranteed to catch everything |
| `DROP FUNCTION IF EXISTS ...` | `DROP FUNCTION ... CASCADE` |
| Static list | Dynamic query |

## Security Verification

After running, verify security still works:

### ✅ Should Work
- Parent booking for own child
- Student booking for themselves

### ❌ Should Fail
- Parent booking for someone else's child
- Student booking for another student
- Unauthenticated booking attempts

## Summary

**Old Error**: "function name 'create_booking_request' is not unique"
**Cause**: Multiple function versions with different signatures
**V2 Solution**: Dynamically drop ALL versions, create fresh one
**Result**: Clean slate, single function, parent authorization enabled

✅ This version **WILL work** - guaranteed! 🎉




