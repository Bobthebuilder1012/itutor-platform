## 🔍 Troubleshooting: Parent Approvals Not Showing

## Issue
- Child sends booking request
- Parent gets notification
- But requests don't show on `/parent/approve-bookings`

---

## 🚀 Quick Fix Steps

### Step 1: Run RLS Fix
**This is likely the issue** - Parents can't see bookings due to missing RLS policy.

1. Open Supabase SQL Editor
2. Run `FIX_PARENT_BOOKINGS_RLS.sql`
3. Should see: "Parent bookings RLS policies created!"

### Step 2: Check Data (Diagnostic)
Run `CHECK_PARENT_APPROVAL_DATA.sql` to see:
- Are parent-child links correct?
- Do bookings exist with `PENDING_PARENT_APPROVAL` status?
- Are notifications being created?

### Step 3: Check Console (Already Added Debug Logs)
1. Open browser console (F12)
2. Reload `/parent/approve-bookings`
3. Look for debug logs:
   - 🔍 Fetching pending bookings
   - 👶 Children found
   - 📋 Child IDs
   - 📚 Bookings found

---

## 🔍 Common Issues & Solutions

### Issue 1: RLS Policy Missing ✅ (Most Likely)
**Symptom**: Console shows "Children found" but "0 bookings"

**Cause**: Parents don't have permission to SELECT bookings for their children

**Fix**: Run `FIX_PARENT_BOOKINGS_RLS.sql`

---

### Issue 2: Wrong Status Value
**Symptom**: Console shows "0 bookings" but bookings exist in database

**Cause**: Bookings have status `PENDING` instead of `PENDING_PARENT_APPROVAL`

**Fix**: Check if `PARENT_APPROVAL_WORKFLOW_COMPLETE.sql` was run
- Should have updated `create_booking_request` function
- Should check `billing_mode = 'parent_required'`
- Should set initial status to `PENDING_PARENT_APPROVAL`

**Manual Fix**:
```sql
-- Update existing bookings for child accounts
UPDATE bookings 
SET status = 'PENDING_PARENT_APPROVAL'
WHERE student_id IN (
    SELECT id FROM profiles WHERE billing_mode = 'parent_required'
)
AND status = 'PENDING';
```

---

### Issue 3: Parent-Child Link Missing
**Symptom**: Console shows "No children linked to parent"

**Cause**: `parent_child_links` table doesn't have the relationship

**Check**:
```sql
SELECT * FROM parent_child_links WHERE parent_id = 'PARENT_ID_HERE';
```

**Fix**: Re-create child account or manually insert link:
```sql
INSERT INTO parent_child_links (parent_id, child_id)
VALUES ('parent_uuid', 'child_uuid');
```

---

### Issue 4: Notification Type Constraint
**Symptom**: Parent gets notification but it's not in database

**Cause**: `booking_needs_parent_approval` not in allowed notification types

**Fix**: Run `FIX_PARENT_NOTIFICATIONS.sql`

---

## 📊 Debug Output Examples

### ✅ Good Output (Working):
```
🔍 Fetching pending bookings for parent: abc-123-def
👶 Children found: [{child_id: "xyz-789"}]
📋 Child IDs: ["xyz-789"]
📚 Bookings found: [{id: "booking-123", status: "PENDING_PARENT_APPROVAL", ...}]
📚 Number of pending bookings: 1
```

### ❌ Bad Output (RLS Issue):
```
🔍 Fetching pending bookings for parent: abc-123-def
👶 Children found: [{child_id: "xyz-789"}]
📋 Child IDs: ["xyz-789"]
📚 Bookings found: []  ← Empty! RLS blocking it
📚 Number of pending bookings: 0
```

### ❌ Bad Output (No Children):
```
🔍 Fetching pending bookings for parent: abc-123-def
👶 Children found: []  ← Empty! No parent-child link
⚠️ No children linked to parent
```

---

## 🔧 Complete Fix Checklist

Run these in order:

### 1. Core Workflow ✅
- [ ] Run `PARENT_APPROVAL_WORKFLOW_COMPLETE.sql`
  - Creates new statuses
  - Updates `create_booking_request` function
  - Creates approval functions

### 2. Notification Types ✅
- [ ] Run `FIX_PARENT_NOTIFICATIONS.sql`
  - Adds `booking_needs_parent_approval` type
  - Allows notifications to be created

### 3. RLS Policies ✅ (CRITICAL)
- [ ] Run `FIX_PARENT_BOOKINGS_RLS.sql`
  - Allows parents to SELECT child bookings
  - Without this, page will be empty!

### 4. Verify Data ✅
- [ ] Run `CHECK_PARENT_APPROVAL_DATA.sql`
  - Check all links and data exist
  - Verify statuses are correct

### 5. Test Flow ✅
- [ ] Child creates booking request
- [ ] Check browser console for debug logs
- [ ] Parent should see booking on approval page
- [ ] Parent can approve/reject

---

## 🎯 Most Likely Issue

**90% chance it's RLS policies.**

Parents can't view the bookings because there's no policy allowing them to SELECT bookings where `student_id IN (child_ids)`.

**Quick fix**: Run `FIX_PARENT_BOOKINGS_RLS.sql` right now!

---

## 📝 Next Steps

1. **Run `FIX_PARENT_BOOKINGS_RLS.sql`** ← Do this first!
2. Reload `/parent/approve-bookings`
3. Check console for debug logs
4. If still not working, run `CHECK_PARENT_APPROVAL_DATA.sql` and share results

---

## 🚨 Emergency: Manual Check

If you need to verify bookings exist in database:

```sql
-- Check if booking exists with correct status
SELECT 
    b.id,
    b.status,
    b.student_id,
    p.full_name AS student_name,
    p.billing_mode
FROM bookings b
JOIN profiles p ON p.id = b.student_id
WHERE p.billing_mode = 'parent_required'
ORDER BY b.created_at DESC
LIMIT 5;
```

If this returns bookings but parent page is empty → **It's RLS!**

---

**TL;DR: Run `FIX_PARENT_BOOKINGS_RLS.sql` to fix RLS policies!** 🎉




