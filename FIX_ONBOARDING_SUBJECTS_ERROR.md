# Fix "Error finding selected subjects" - Tutor Onboarding

## Problem

When completing tutor onboarding and selecting subjects, you get:
```
Error finding selected subjects. Please try again.
```

Console shows: `Subjects fetch error: null` and query returns 0 results.

## Root Cause

The query `.in('label', selectedSubjects)` is returning 0 results, which means either:
1. **RLS policy is blocking reads** from subjects table (most likely)
2. Selected labels don't exactly match database labels

## Quick Fix - Apply RLS Policy

Run `FIX_SUBJECTS_RLS_POLICY.sql` in Supabase SQL Editor:

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `FIX_SUBJECTS_RLS_POLICY.sql`
3. Paste and Run
4. Should see: "Success" ✅

**What this does:** Creates a public read policy on subjects table so all users can fetch subjects.

## Verify the Fix

### Step 1: Check RLS Policy

Run `DEBUG_SUBJECTS_FETCH.sql` to see:
- Is RLS enabled on subjects?
- What policies exist?
- Can authenticated users read subjects?

### Step 2: Test the Query

In SQL Editor, run:
```sql
-- This simulates what the onboarding page does
SELECT id, label
FROM subjects
WHERE label IN ('CAPE Applied Mathematics', 'CSEC Mathematics')
LIMIT 5;
```

**Expected:** Should return rows ✅  
**If returns 0 rows:** RLS is blocking, apply the fix above

### Step 3: Test Onboarding Again

1. Refresh the tutor onboarding page
2. Search for subjects (e.g., "Computer Science")
3. Select subjects from dropdown
4. Select your school
5. Click "Complete Onboarding"
6. Should work now! ✅

## Alternative: Disable RLS on Subjects (Quick Test)

If you just want to test quickly:

```sql
-- Temporarily disable RLS on subjects table
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;

-- Try onboarding again - should work
-- Then re-enable it and apply proper policy:
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
```

Then apply `FIX_SUBJECTS_RLS_POLICY.sql` for the permanent fix.

## Additional Debugging

If the fix above doesn't work, check if labels match:

```sql
-- See what labels exist in database
SELECT DISTINCT label
FROM subjects
WHERE name ILIKE '%computer%'
   OR name ILIKE '%math%'
ORDER BY label;

-- Check the exact labels you're trying to select
-- (look in browser console for the selectedSubjects array)
```

The labels should match exactly. For example:
- Database: `"CSEC Mathematics"`
- UI search: Should also show `"CSEC Mathematics"`

If they don't match, the search/dropdown component might be formatting them differently.

## Summary

**Most likely fix:** Run `FIX_SUBJECTS_RLS_POLICY.sql`

This creates a public read policy on the subjects table so authenticated users can fetch subjects during onboarding.

After applying, tutor onboarding should work for all users! ✅

