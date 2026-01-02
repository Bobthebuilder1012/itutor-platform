# User Subjects Implementation Summary

## Overview

This document summarizes the implementation of the `user_subjects` junction table system for the iTutor platform. This replaces the previous approach of storing subject labels as arrays in the `profiles` table.

## What Was Implemented

### 1. Database Schema (SQL Migration)

**File:** `src/supabase/migrations/002_user_subjects_junction.sql`

Created the `user_subjects` junction table with:
- Links `profiles.id` to `subjects.id`
- Unique constraint on `(user_id, subject_id)` to prevent duplicates
- Proper indexes for query performance
- RLS (Row Level Security) policies
- Auto-updating `updated_at` trigger

**To apply:** Run this SQL script in your Supabase SQL Editor.

### 2. TypeScript Utility Library

**File:** `lib/supabase/userSubjects.ts`

Created a comprehensive API for working with user subjects:

**Read Operations:**
- `getUserSubjects(userId)` - Get all subjects with full details
- `getUserSubjectIds(userId)` - Get array of subject UUIDs
- `getUserSubjectLabels(userId)` - Get array of subject labels
- `getAllSubjects()` - Get all active subjects from subjects table
- `getSubjectsByLabels(labels)` - Get subject records by labels
- `userHasSubject(userId, subjectId)` - Check if user has a subject

**Write Operations:**
- `setUserSubjects(userId, labels)` - Replace all subjects (used in onboarding)
- `addUserSubject(userId, label)` - Add one subject without removing others
- `removeUserSubject(userId, subjectId)` - Remove one subject

### 3. Updated Onboarding Pages

**Files:**
- `app/onboarding/student/page.tsx`
- `app/onboarding/tutor/page.tsx`

Both onboarding pages now:
1. Update basic profile information (school, form_level, etc.)
2. Call `setUserSubjects()` to write selected subjects to the junction table
3. No longer store subjects as arrays in the profiles table

**Key Changes:**
```typescript
// OLD approach (profiles.subjects_of_study array)
await supabase
  .from('profiles')
  .update({ subjects_of_study: selectedSubjects })
  .eq('id', userId);

// NEW approach (user_subjects junction table)
await setUserSubjects(userId, selectedSubjects);
```

### 4. Display Component

**File:** `components/UserSubjectsDisplay.tsx`

Created a reusable component for displaying a user's subjects:
- Fetches subjects automatically
- Groups by CSEC/CAPE
- Shows loading and error states
- Color-coded badges
- Responsive design

**Usage:**
```tsx
<UserSubjectsDisplay userId={userId} title="My Subjects" />
```

### 5. Documentation

**Files:**
- `docs/user-subjects-guide.md` - Comprehensive usage guide
- `docs/user-subjects-implementation-summary.md` - This file

## How to Deploy

### Step 1: Run the SQL Migration

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `src/supabase/migrations/002_user_subjects_junction.sql`
5. Click **Run**

Verify the table was created:
```sql
SELECT * FROM public.user_subjects LIMIT 5;
```

### Step 2: Verify Subjects Table Exists

Make sure you've already run the subjects table migration from your previous step:

```sql
SELECT COUNT(*) FROM public.subjects;
-- Should return 88 (47 CSEC + 41 CAPE subjects)
```

If the subjects table doesn't exist or is empty, run the subjects creation SQL first.

### Step 3: Test the Onboarding Flow

1. **Student onboarding:**
   - Navigate to `/onboarding/student`
   - Select subjects
   - Submit the form
   - Check that rows were created in `user_subjects` table

2. **Tutor onboarding:**
   - Navigate to `/onboarding/tutor`
   - Select subjects
   - Submit the form
   - Check that rows were created in `user_subjects` table

**Verify in Supabase:**
```sql
SELECT 
  us.id,
  p.full_name,
  p.role,
  s.label as subject
FROM user_subjects us
JOIN profiles p ON us.user_id = p.id
JOIN subjects s ON us.subject_id = s.id
ORDER BY p.full_name, s.label;
```

### Step 4: (Optional) Migrate Existing Data

If you have existing users with subjects stored in `profiles.subjects_of_study`, you can migrate them:

```typescript
// Run this migration script once
import { supabase } from '@/lib/supabase/client';
import { setUserSubjects } from '@/lib/supabase/userSubjects';

async function migrateExistingSubjects() {
  // Get all students/tutors with subjects
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subjects_of_study')
    .not('subjects_of_study', 'is', null);

  for (const profile of profiles || []) {
    if (profile.subjects_of_study?.length > 0) {
      console.log(`Migrating subjects for user ${profile.id}`);
      const { error } = await setUserSubjects(
        profile.id, 
        profile.subjects_of_study
      );
      
      if (error) {
        console.error(`Error migrating user ${profile.id}:`, error);
      }
    }
  }
  
  console.log('Migration complete!');
}
```

## Usage Examples

### In a Student Dashboard

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getUserSubjects } from '@/lib/supabase/userSubjects';
import UserSubjectsDisplay from '@/components/UserSubjectsDisplay';

export default function StudentDashboard() {
  const [userId, setUserId] = useState<string | null>(null);

  // ... authentication logic ...

  return (
    <div className="dashboard">
      <h1>My Dashboard</h1>
      
      {/* Easy way: Use the component */}
      <UserSubjectsDisplay userId={userId!} title="My Subjects" />
      
      {/* Or fetch manually for custom display */}
      {/* ... */}
    </div>
  );
}
```

### Finding Tutors by Subject

```tsx
// Get all tutors who teach a specific subject
const { data: tutorsData } = await supabase
  .from('user_subjects')
  .select(`
    user_id,
    subject:subjects(id, label, level),
    tutor:profiles!user_id(
      id,
      full_name,
      rating_average,
      rating_count,
      school
    )
  `)
  .eq('subject_id', subjectId)
  .eq('profiles.role', 'tutor')
  .order('profiles.rating_average', { ascending: false });
```

### Getting a User's Subject Count

```tsx
const { count } = await supabase
  .from('user_subjects')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId);

console.log(`User has ${count} subjects`);
```

## API Reference Quick Guide

```typescript
// Get subjects for a user
const { data, error } = await getUserSubjects(userId);
// Returns: UserSubjectWithDetails[]

// Get just the labels
const labels = await getUserSubjectLabels(userId);
// Returns: string[] like ["CSEC Mathematics", "CAPE Physics"]

// Set subjects (replaces all existing)
await setUserSubjects(userId, [
  'CSEC Mathematics',
  'CSEC English A',
  'CAPE Physics'
]);

// Add one subject (doesn't remove existing)
await addUserSubject(userId, 'CSEC Biology');

// Remove a subject
await removeUserSubject(userId, subjectId);

// Check if user has subject
const hasSubject = await userHasSubject(userId, subjectId);
```

## Benefits

### Before (Array in Profile)
```sql
-- profiles table
subjects_of_study: ["CSEC Mathematics", "CSEC Physics", "CAPE Biology"]
```

**Problems:**
- No referential integrity
- Can't easily join with subject details
- Hard to query (e.g., "all students studying CSEC Math")
- Array operations are slower
- No validation of subject names

### After (Junction Table)
```sql
-- user_subjects table
user_id | subject_id
--------|------------
uuid1   | uuid-math
uuid1   | uuid-physics
uuid1   | uuid-biology
```

**Benefits:**
✅ Referential integrity (foreign keys)
✅ Easy joins for complex queries
✅ Fast indexed lookups
✅ Validated subject IDs
✅ Normalized data structure
✅ Can add metadata (proficiency, date added, etc.)

## Database Queries You Can Now Run

### Find all students studying a subject
```sql
SELECT 
  p.id,
  p.full_name,
  p.school,
  p.form_level
FROM user_subjects us
JOIN profiles p ON us.user_id = p.id
JOIN subjects s ON us.subject_id = s.id
WHERE s.label = 'CSEC Mathematics'
  AND p.role = 'student';
```

### Find tutors teaching both CSEC and CAPE
```sql
SELECT 
  p.id,
  p.full_name,
  COUNT(DISTINCT s.level) as level_count
FROM user_subjects us
JOIN profiles p ON us.user_id = p.id
JOIN subjects s ON us.subject_id = s.id
WHERE p.role = 'tutor'
GROUP BY p.id, p.full_name
HAVING COUNT(DISTINCT s.level) = 2;
```

### Most popular subjects (by student enrollment)
```sql
SELECT 
  s.label,
  s.level,
  COUNT(us.user_id) as student_count
FROM subjects s
LEFT JOIN user_subjects us ON s.id = us.subject_id
LEFT JOIN profiles p ON us.user_id = p.id AND p.role = 'student'
GROUP BY s.id, s.label, s.level
ORDER BY student_count DESC
LIMIT 10;
```

## RLS Security

The `user_subjects` table has Row Level Security enabled with these policies:

1. ✅ Users can read their own subjects
2. ✅ Anyone can read all user subjects (for tutor discovery)
3. ✅ Users can insert subjects for themselves
4. ✅ Users can delete their own subjects
5. ✅ Admins have full CRUD access

**Important:** The table is publicly readable to enable features like:
- Browsing tutors and seeing what they teach
- Matching students with tutors
- Subject popularity statistics

If you need to hide subjects, add a `is_public` boolean column.

## Future Enhancements

Consider adding these fields to `user_subjects` later:

```sql
ALTER TABLE user_subjects ADD COLUMN proficiency_level text;
ALTER TABLE user_subjects ADD COLUMN years_experience integer;
ALTER TABLE user_subjects ADD COLUMN is_public boolean DEFAULT true;
ALTER TABLE user_subjects ADD COLUMN notes text;
```

This would allow:
- Students to rate their skill level (beginner, intermediate, advanced)
- Tutors to specify years of teaching experience per subject
- Users to hide certain subjects from public view
- Personal notes about the subject

## Troubleshooting

### Error: "relation user_subjects does not exist"
**Solution:** Run the migration SQL in Supabase SQL Editor.

### Error: "Subject not found"
**Solution:** Verify the subject label exactly matches what's in the `subjects` table:
```sql
SELECT label FROM subjects WHERE label ILIKE '%mathematics%';
```

### Error: "duplicate key value violates unique constraint"
**Solution:** The user already has this subject. Use `getUserSubjectIds()` to check first.

### Subjects not appearing in UI
**Solution:** Check the browser console for errors. Verify:
1. User is authenticated
2. `user_subjects` has rows for that user
3. RLS policies allow reading

### Performance issues with large datasets
**Solution:** The table is already indexed on `user_id` and `subject_id`. For additional optimization:
```sql
CREATE INDEX idx_user_subjects_user_subject ON user_subjects(user_id, subject_id);
```

## Support

For questions or issues:
1. Check `docs/user-subjects-guide.md` for detailed API documentation
2. Review the migration SQL file for schema details
3. Examine `lib/supabase/userSubjects.ts` for function implementations

## Checklist

- [ ] Run `002_user_subjects_junction.sql` in Supabase
- [ ] Verify subjects table has all CSEC/CAPE subjects
- [ ] Test student onboarding flow
- [ ] Test tutor onboarding flow
- [ ] Verify `user_subjects` rows are created
- [ ] (Optional) Migrate existing subjects_of_study data
- [ ] Test displaying subjects in dashboard/profile
- [ ] Test searching tutors by subject
- [ ] Verify RLS policies work as expected

---

**Implementation Date:** December 2025
**Status:** ✅ Ready for Production







