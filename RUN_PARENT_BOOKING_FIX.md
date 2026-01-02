# Fix Parent Booking Authorization - Run Guide

## Issue
Parents cannot book sessions for their children. Getting error:
```
"Unauthorized: You can only create bookings for yourself"
```

## Solution
Update the `create_booking_request` function to allow parents to book for their children by checking the `parent_child_links` relationship.

## How to Run

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project: https://supabase.com/dashboard/project/nfkrfciozjxrodkusrpnh
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Copy and Execute SQL
1. Open the file: `FIX_PARENT_BOOKING_AUTHORIZATION.sql`
2. Copy **ALL** the contents
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### Step 3: Verify Success
You should see:
```
Success. No rows returned
```

**Note**: The SQL script will drop all existing versions of `create_booking_request` and create a new one. This is normal and safe.

## What Changed

### Before
```sql
-- Only allowed users to book for themselves
IF auth.uid() != p_student_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
END IF;
```

### After
```sql
-- Allows users to book for themselves OR their children
IF auth.uid() != p_student_id THEN
    -- Check if authenticated user is a parent of this student
    SELECT EXISTS(
        SELECT 1 
        FROM parent_child_links 
        WHERE parent_id = auth.uid() 
        AND child_id = p_student_id
    ) INTO v_is_parent;
    
    IF NOT v_is_parent THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself or your children';
    END IF;
END IF;
```

## Testing After Fix

### Test 1: Parent Booking for Child
1. Login as a parent account
2. Search for a tutor
3. Click on the tutor
4. Select your child from the dropdown
5. Select a subject
6. Pick a time slot
7. Click "Request Booking"
8. ✅ Should succeed (no more authorization error)

### Test 2: Student Booking for Themselves
1. Login as a student account
2. Search for a tutor
3. Click on the tutor
4. Select a subject
5. Pick a time slot
6. Click "Request Booking"
7. ✅ Should succeed (existing functionality still works)

### Test 3: Unauthorized Booking (Security Check)
1. Try to book for a student who is NOT your child
2. ❌ Should fail with: "Unauthorized: You can only create bookings for yourself or your children"

## Security Notes

### ✅ What's Protected
- Parents can ONLY book for children linked in `parent_child_links` table
- Students can ONLY book for themselves
- No one can book for unrelated students
- All existing security checks remain in place

### ✅ How It Works
1. Function checks if `auth.uid()` (logged-in user) matches `p_student_id` (booking recipient)
2. If NOT a match, checks if logged-in user is in `parent_child_links` as parent of the student
3. If neither check passes, throws authorization error
4. If either check passes, booking proceeds normally

## Rollback (If Needed)

If you need to revert this change:

1. Go to Supabase SQL Editor
2. Run:
```sql
-- Revert to original function (students only)
CREATE OR REPLACE FUNCTION create_booking_request(
    p_tutor_id uuid,
    p_student_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT '',
    p_price_ttd numeric DEFAULT NULL,
    p_duration_minutes int DEFAULT 60
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_calculated_price numeric;
    v_tutor_hourly_rate numeric;
    v_actual_duration_minutes int;
BEGIN
    -- Validate auth (original - students only)
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;
    
    -- ... rest of function ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Summary

**Before Fix**: Parents got 400 error when trying to book for children
**After Fix**: Parents can successfully book for their children
**Security**: Still prevents unauthorized bookings

✅ Safe to deploy!

