# iTutor Test Data Generation

This guide explains how to populate your iTutor platform with realistic test data for development and testing.

## 📊 What Gets Created

- **500 Total Users**
  - 125 Tutors (1:3 tutor-to-student ratio)
  - 350 Students
  - 25 Parents

## 🎯 Features

### Tutors
- ✅ Realistic Caribbean schools and forms
- ✅ 1-4 subjects per tutor
- ✅ Hourly rates between $25-$100
- ✅ ~30% have verified subjects with grades
- ✅ Verified subjects show grades I, II, or III
- ✅ Random bios and created dates

### Students
- ✅ Distributed across 15 Caribbean schools
- ✅ Surplus in popular schools:
  - Queens Royal College
  - Naparima College
  - St. Josephs Convent
  - Fatima College
- ✅ Forms 1-6
- ✅ Realistic names and bios

### Parents
- ✅ 25 parent accounts
- ✅ Realistic profiles

## 🚀 How to Use

### Step 1: Run the Seed Script

In your Supabase SQL Editor or psql:

```sql
-- Run the seed script
\i SEED_TEST_USERS.sql
```

Or copy and paste the contents of `SEED_TEST_USERS.sql` into the Supabase SQL Editor and execute.

**Expected output:**
```
Starting test user generation...
Creating 125 tutors...
  Created 25 tutors...
  Created 50 tutors...
  ...
Completed: 125 tutors created
Creating 350 students...
  Created 50 students...
  ...
Completed: 350 students created
Creating 25 parents...
Completed: 25 parents created

========================================
TEST DATA GENERATION COMPLETE
========================================
Total Users Created: 500
  - Tutors: 125
  - Students: 350
  - Parents: 25
```

### Step 2: Verify Data

Check the created data:

```sql
-- View all test users by role
SELECT role, COUNT(*) 
FROM profiles 
WHERE is_test_data = true 
GROUP BY role;

-- View tutors with their subjects
SELECT 
  p.display_name,
  p.school,
  ts.subject_name,
  ts.hourly_rate,
  CASE WHEN vs.id IS NOT NULL THEN 'Verified' ELSE 'Not Verified' END as verification_status
FROM profiles p
JOIN tutor_subjects ts ON p.id = ts.tutor_id
LEFT JOIN verified_subjects vs ON ts.tutor_id = vs.tutor_id AND ts.subject_name = vs.subject_name
WHERE p.is_test_data = true
ORDER BY p.display_name
LIMIT 20;

-- View student distribution by school
SELECT 
  school,
  COUNT(*) as student_count
FROM profiles
WHERE is_test_data = true AND role = 'student'
GROUP BY school
ORDER BY student_count DESC;
```

### Step 3: Test the Platform

All test users can be interacted with:
- Search for tutors by subject or name
- View tutor profiles with verified subjects
- Filter by school, rating, etc.
- Book sessions (if implementing booking logic)

**Test Credentials Format:**
- Email: `tutor1@testitutor.com`, `student1@testitutor.com`, `parent1@testitutor.com`
- Username: `tutor_test_1`, `student_test_1`, `parent_test_1`

## 🧹 Cleanup

### Option 1: Safe Cleanup (Recommended)

Run the cleanup script to review before deleting:

```sql
\i CLEANUP_TEST_USERS.sql
```

This will show you what will be deleted. Then uncomment the DELETE line in the script and run again.

### Option 2: Direct Cleanup

Delete all test data in one command:

```sql
DELETE FROM profiles WHERE is_test_data = true;
```

This will cascade and remove:
- All test profiles
- All tutor subjects
- All verified subjects
- All related data

### Verify Cleanup

```sql
-- Should return 0
SELECT COUNT(*) FROM profiles WHERE is_test_data = true;
```

## 📋 Technical Details

### Database Schema Requirements

The seed script requires:
- `profiles` table with columns: `id`, `username`, `display_name`, `email`, `role`, `school`, `form`, `bio`, `is_test_data`, `created_at`
- `tutor_subjects` table with columns: `tutor_id`, `subject_name`, `hourly_rate`, `created_at`
- `verified_subjects` table with columns: `tutor_id`, `subject_name`, `grade_achieved`, `is_public`, `verified_at`

### New Column Added

The script adds `is_test_data BOOLEAN` column to the `profiles` table if it doesn't exist. This column is used to tag all test users for easy identification and removal.

### Subjects Included

20 CSEC/CAPE subjects:
- Mathematics
- English Language
- English Literature
- Biology, Chemistry, Physics
- Spanish, French
- Geography, History
- Information Technology
- Principles of Accounts, Principles of Business
- Economics, Social Studies
- Integrated Science
- Human and Social Biology
- Agricultural Science
- Technical Drawing
- Food and Nutrition

### Caribbean Schools Included

15 real Caribbean schools (primarily Trinidad & Tobago):
- Queens Royal College (popular)
- Naparima College (popular)
- St. Josephs Convent (popular)
- Fatima College (popular)
- St. Augustines Secondary
- Holy Name Convent
- Presentation College
- St. Georges College
- Bishops High School
- And 6 more...

## ⚠️ Important Notes

1. **Don't run in production** - This is for development/testing only
2. **Unique constraint handling** - The script uses deterministic usernames/emails to avoid conflicts if run multiple times
3. **Cascade deletes** - Deleting test profiles will automatically delete related tutor_subjects and verified_subjects
4. **No authentication** - These are database-only entries; you can't log in as these users (no auth.users entries)
5. **Interactable** - All users can be searched, viewed, and filtered in your UI

## 🔄 Re-running the Script

If you need to regenerate data:

```sql
-- 1. Clean up existing test data
DELETE FROM profiles WHERE is_test_data = true;

-- 2. Re-run the seed script
\i SEED_TEST_USERS.sql
```

## 📊 Sample Queries

### Find verified tutors for a subject
```sql
SELECT 
  p.display_name,
  p.school,
  ts.hourly_rate,
  vs.grade_achieved
FROM profiles p
JOIN tutor_subjects ts ON p.id = ts.tutor_id
JOIN verified_subjects vs ON ts.tutor_id = vs.tutor_id AND ts.subject_name = vs.subject_name
WHERE ts.subject_name = 'Mathematics' 
  AND p.is_test_data = true
ORDER BY ts.hourly_rate;
```

### Count students by popular schools
```sql
SELECT 
  school,
  form,
  COUNT(*) as students
FROM profiles
WHERE is_test_data = true 
  AND role = 'student'
  AND school IN ('Queens Royal College', 'Naparima College', 'St. Josephs Convent', 'Fatima College')
GROUP BY school, form
ORDER BY school, form;
```

## 🐛 Troubleshooting

### Error: column "is_test_data" does not exist
The script should auto-create this column. If it fails, manually run:
```sql
ALTER TABLE profiles ADD COLUMN is_test_data BOOLEAN DEFAULT false;
```

### Error: duplicate key value violates unique constraint
If usernames/emails conflict, clean up first:
```sql
DELETE FROM profiles WHERE username LIKE '%_test_%';
```

Then re-run the seed script.

### Slow performance
The script creates 500 users which may take 10-30 seconds. If it's too slow, reduce the loop counts in the script.

## 📝 Customization

Edit `SEED_TEST_USERS.sql` to customize:
- Number of users (change loop counts)
- Schools (edit the `schools` array)
- Subjects (edit the `subjects` array)
- Names (edit the `first_names` and `last_names` arrays)
- Verification rate (change `random() < 0.3` to adjust percentage)
- Rate ranges (change `25 + (random() * 75)` for different min/max)

---

**Questions or issues?** Check the script comments or reach out to the dev team.











