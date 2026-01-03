# User Subjects System

This document explains the `user_subjects` junction table and how to work with it in the iTutor platform.

## Overview

The `user_subjects` table is a junction/link table that connects users (students and tutors) to the subjects they study or teach. This replaces the old approach of storing subject labels as arrays in the `profiles` table.

## Database Structure

### Tables Involved

1. **`subjects`** - Contains all CSEC and CAPE subjects
   - `id` (uuid) - Primary key
   - `level` (text) - 'CSEC' or 'CAPE'
   - `name` (text) - Subject name (e.g., 'Mathematics')
   - `label` (text) - Full display name (e.g., 'CSEC Mathematics')
   - `code` (text, nullable) - Optional subject code
   - `is_active` (boolean) - Whether the subject is active

2. **`user_subjects`** - Junction table linking users to subjects
   - `id` (uuid) - Primary key
   - `user_id` (uuid) - Foreign key to `profiles.id`
   - `subject_id` (uuid) - Foreign key to `subjects.id`
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)
   - **UNIQUE constraint on `(user_id, subject_id)`** - Prevents duplicates

## Running the Migration

To set up the `user_subjects` table in Supabase:

1. Open your Supabase project dashboard
2. Navigate to SQL Editor
3. Open and run the SQL script: `src/supabase/migrations/002_user_subjects_junction.sql`

## TypeScript API

The `lib/supabase/userSubjects.ts` file provides helper functions for working with user subjects.

### Getting User Subjects

#### Get all subjects for a user (with full details)

```typescript
import { getUserSubjects } from '@/lib/supabase/userSubjects';

const { data, error } = await getUserSubjects(userId);

// Returns: UserSubjectWithDetails[]
// Each item includes the subject details:
// {
//   id: 'uuid',
//   user_id: 'uuid',
//   subject_id: 'uuid',
//   subject: {
//     id: 'uuid',
//     level: 'CSEC' | 'CAPE',
//     name: 'Mathematics',
//     label: 'CSEC Mathematics',
//     ...
//   }
// }
```

#### Get subject IDs only

```typescript
import { getUserSubjectIds } from '@/lib/supabase/userSubjects';

const subjectIds = await getUserSubjectIds(userId);
// Returns: string[] (array of UUIDs)
```

#### Get subject labels only

```typescript
import { getUserSubjectLabels } from '@/lib/supabase/userSubjects';

const labels = await getUserSubjectLabels(userId);
// Returns: string[] (e.g., ["CSEC Mathematics", "CAPE Physics"])
```

### Setting User Subjects

#### Replace all subjects for a user

```typescript
import { setUserSubjects } from '@/lib/supabase/userSubjects';

const subjectLabels = [
  'CSEC Mathematics',
  'CSEC Physics',
  'CSEC Chemistry',
];

const { error } = await setUserSubjects(userId, subjectLabels);
```

**Note:** This function:
1. Looks up the subject IDs from the provided labels
2. Deletes all existing `user_subjects` rows for the user
3. Inserts new rows for the provided subjects

#### Add a single subject (without removing existing ones)

```typescript
import { addUserSubject } from '@/lib/supabase/userSubjects';

const { error } = await addUserSubject(userId, 'CSEC Biology');
```

#### Remove a subject

```typescript
import { removeUserSubject } from '@/lib/supabase/userSubjects';

const { error } = await removeUserSubject(userId, subjectId);
```

#### Check if user has a subject

```typescript
import { userHasSubject } from '@/lib/supabase/userSubjects';

const hasSubject = await userHasSubject(userId, subjectId);
// Returns: boolean
```

### Working with the Subjects Table

#### Get all active subjects

```typescript
import { getAllSubjects } from '@/lib/supabase/userSubjects';

const { data, error } = await getAllSubjects();
// Returns all active subjects ordered by level and name
```

#### Get subjects by labels

```typescript
import { getSubjectsByLabels } from '@/lib/supabase/userSubjects';

const { data, error } = await getSubjectsByLabels([
  'CSEC Mathematics',
  'CAPE Physics',
]);
```

## Usage Examples

### Student Onboarding

```typescript
// In the onboarding form submission
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  // Update basic profile info
  await supabase
    .from('profiles')
    .update({ school, form_level: formLevel })
    .eq('id', userId);
  
  // Set subjects using junction table
  await setUserSubjects(userId, selectedSubjects);
  
  router.push('/student/dashboard');
};
```

### Tutor Onboarding

```typescript
// Similar to student, but for tutors
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  await supabase
    .from('profiles')
    .update({ school, teaching_levels: selectedLevels })
    .eq('id', userId);
  
  // Set teaching subjects
  await setUserSubjects(userId, selectedSubjects);
  
  router.push('/tutor/dashboard');
};
```

### Displaying User Subjects in a Profile

```typescript
'use client';

import { useEffect, useState } from 'react';
import { getUserSubjects } from '@/lib/supabase/userSubjects';

export default function UserProfile({ userId }: { userId: string }) {
  const [subjects, setSubjects] = useState<any[]>([]);
  
  useEffect(() => {
    async function loadSubjects() {
      const { data } = await getUserSubjects(userId);
      if (data) setSubjects(data);
    }
    loadSubjects();
  }, [userId]);
  
  return (
    <div>
      <h2>Subjects</h2>
      <ul>
        {subjects.map((item) => (
          <li key={item.id}>
            {item.subject.label}
            <span className={item.subject.level === 'CSEC' ? 'badge-csec' : 'badge-cape'}>
              {item.subject.level}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Finding Tutors by Subject

```typescript
// Get all tutors teaching a specific subject
const { data: userSubjects } = await supabase
  .from('user_subjects')
  .select(`
    user_id,
    subject:subjects(label),
    tutor:profiles!user_id(id, full_name, role, rating_average)
  `)
  .eq('subject_id', subjectId)
  .eq('tutor.role', 'tutor');

// userSubjects will contain all tutors linked to the subject
```

## Row Level Security (RLS)

The `user_subjects` table has the following RLS policies:

1. **Users can read their own subjects** - Users can see their own subject links
2. **Anyone can read user subjects** - Public read access (needed for tutor discovery)
3. **Users can insert their own subjects** - Users can add subjects for themselves
4. **Users can delete their own subjects** - Users can remove subjects from themselves
5. **Admins have full access** - Admins can manage all user subjects

## Migration from Old System

If you're migrating from the old `subjects_of_study` array field:

```typescript
// Old way (storing arrays in profiles)
await supabase
  .from('profiles')
  .update({ subjects_of_study: ['CSEC Math', 'CSEC Physics'] })
  .eq('id', userId);

// New way (using junction table)
await setUserSubjects(userId, ['CSEC Mathematics', 'CSEC Physics']);
```

### Migration Script Example

```typescript
// Migrate existing subjects_of_study to user_subjects table
async function migrateSubjects() {
  // Get all profiles with subjects
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subjects_of_study')
    .not('subjects_of_study', 'is', null);
  
  for (const profile of profiles || []) {
    if (profile.subjects_of_study?.length > 0) {
      await setUserSubjects(profile.id, profile.subjects_of_study);
    }
  }
}
```

## Benefits of Junction Table Approach

1. **Normalized data** - Subjects defined once, referenced many times
2. **Referential integrity** - Foreign key constraints prevent invalid data
3. **Easier queries** - Join on subject_id instead of searching arrays
4. **Better performance** - Indexed lookups instead of array operations
5. **Flexible relationships** - Easy to add metadata (e.g., proficiency level, date added)
6. **Type safety** - Subject IDs are validated against the subjects table

## Troubleshooting

### "Subject not found" error

This usually means the subject label doesn't match exactly. Check:
- Case sensitivity: 'CSEC Mathematics' vs 'CSEC mathematics'
- Spacing: 'CSEC Mathematics' vs 'CSEC  Mathematics'
- Make sure the subject exists in the `subjects` table and `is_active = true`

### Duplicate key violation

The `(user_id, subject_id)` pair must be unique. Use `setUserSubjects()` to replace all subjects, or check if the subject already exists before adding.

### RLS policy error

Make sure the user is authenticated (`auth.uid()` is not null) and the JWT contains valid user data.

## Next Steps

Consider extending the system:
- Add a `proficiency_level` column to track student progress
- Add a `years_teaching` column for tutors
- Add a `certification_url` for verified qualifications
- Track when subjects were added/removed for analytics










