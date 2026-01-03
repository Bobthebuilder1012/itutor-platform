# Fix Tutor Subjects RLS Policies

## Problem
Tutors are getting a "403 Forbidden" error when trying to add subjects:
```
new row violates row-level security policy for table "tutor_subjects"
```

## Solution
Run the `FIX_TUTOR_SUBJECTS_RLS.sql` script to create proper RLS policies.

## Steps

### 1. Open Supabase SQL Editor
- Go to https://supabase.com/dashboard
- Select your project
- Click "SQL Editor" in the left sidebar

### 2. Run the SQL Script
- Copy all contents from `FIX_TUTOR_SUBJECTS_RLS.sql`
- Paste into the SQL Editor
- Click "Run" or press Ctrl+Enter

### 3. Verify Success
You should see a success message. The script will:
- ✅ Drop any existing conflicting policies
- ✅ Enable RLS on `tutor_subjects`
- ✅ Create policies allowing tutors to manage their subjects
- ✅ Allow students/parents to view subjects (for browsing)

### 4. Test
- Go back to your tutor dashboard
- Try adding a subject
- Should work without errors! ✅

## What the Policies Do

### For Tutors:
- ✅ **SELECT**: View their own subjects
- ✅ **INSERT**: Add new subjects (only their own)
- ✅ **UPDATE**: Edit their own subjects
- ✅ **DELETE**: Remove their own subjects

### For Students/Parents:
- ✅ **SELECT**: View all tutor subjects (needed for browsing/searching tutors)
- ❌ Cannot insert/update/delete

## If You Still Get Errors

1. **Check you're logged in as a tutor:**
   - Run in SQL Editor:
   ```sql
   SELECT id, email, role FROM profiles WHERE id = auth.uid();
   ```
   - Should show `role = 'tutor'`

2. **Check RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'tutor_subjects';
   ```
   - Should show `rowsecurity = true`

3. **List current policies:**
   ```sql
   SELECT policyname, cmd, qual 
   FROM pg_policies 
   WHERE tablename = 'tutor_subjects';
   ```
   - Should show 5 policies created by our script

4. **Try logging out and back in** - Sometimes auth tokens need to refresh

## Need Help?
If still having issues, check:
- Browser console (F12) for more error details
- Supabase logs for any database errors
- Make sure your tutor account `id` matches `auth.uid()`






