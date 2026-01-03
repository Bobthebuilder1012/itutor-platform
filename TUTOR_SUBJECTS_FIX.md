# Tutor Subjects Loading Fix

## Problem
The tutor dashboard was getting 400 Bad Request errors when trying to fetch subjects with the error:
```
"Could not find a relationship between 'tutor_subjects' and 'subjects' in the schema cache"
```

## Root Cause
PostgREST (Supabase's API layer) couldn't find or recognize the foreign key relationship between `tutor_subjects` and `subjects`, even though it exists in the database schema.

## Solution Applied
Instead of relying on PostgREST's foreign key joins, we now:
1. Fetch `tutor_subjects` data separately
2. Fetch all `subjects` data separately  
3. Manually join them in JavaScript using a Map for O(n) performance

### Code Changes
**File:** `app/tutor/dashboard/page.tsx`

**Before (broken):**
```typescript
supabase
  .from('tutor_subjects')
  .select('*, subjects(*)')  // <- This was failing
  .eq('tutor_id', profile.id)
```

**After (working):**
```typescript
// Fetch separately
const tutorSubjectsRes = await supabase
  .from('tutor_subjects')
  .select('*')
  .eq('tutor_id', profile.id);

const allSubjectsRes = await supabase
  .from('subjects')
  .select('*');

// Join in JavaScript
const subjectsMap = new Map(allSubjectsRes.data.map(s => [s.id, s]));
const enrichedTutorSubjects = tutorSubjectsRes.data.map(ts => ({
  ...ts,
  subjects: subjectsMap.get(ts.subject_id)
}));
```

## Additional Files Created

### 1. `FIX_TUTOR_SUBJECTS_FK.sql`
SQL script to:
- Check if the foreign key exists
- Create it if missing
- Refresh PostgREST schema cache
- Verify the constraint

**To run:** Open Supabase Dashboard → SQL Editor → paste and execute

### 2. `CHECK_TUTOR_DATA.sql`
Diagnostic queries to:
- Check if tutor exists
- Count records in tutor_subjects
- List subjects for a specific tutor
- Verify subjects table has data

**To run:** Open Supabase Dashboard → SQL Editor → replace 'YOUR_TUTOR_ID_HERE' with actual ID → execute

## Testing
1. **Refresh your browser** (hard refresh: Ctrl+Shift+R)
2. **Check console** - you should see:
   - `Tutor subjects response: {...}`
   - `All subjects response: {...}`
   - `Enriched tutor subjects: [...]`
3. **Verify display** - subjects should now appear in "Subjects You Teach" section

## Benefits of This Approach
✅ **Bypasses PostgREST FK issues** - No dependency on schema cache  
✅ **More reliable** - Direct queries can't fail on relationship resolution  
✅ **Performance** - Uses Map for O(n) join instead of nested loops  
✅ **Better debugging** - Can see exactly what data is being fetched  

## If Issues Persist
1. Run `CHECK_TUTOR_DATA.sql` to verify tutor has subjects in the database
2. Run `FIX_TUTOR_SUBJECTS_FK.sql` to ensure FK exists
3. Check if subjects were saved during onboarding (they should have been inserted into `tutor_subjects`)

---

**Last Updated:** December 25, 2025  
**Fixed By:** Manual JavaScript join instead of PostgREST foreign key join








