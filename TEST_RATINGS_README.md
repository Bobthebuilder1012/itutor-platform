# Test Ratings Generator

This folder contains scripts to add and remove test ratings for all tutors on the platform.

## 📋 Files

1. **`src/supabase/migrations/050_add_test_data_flags.sql`** - Migration (run first!)
2. **`ADD_TEST_RATINGS.sql`** - Generates random ratings
3. **`CLEANUP_TEST_RATINGS.sql`** - Removes all test ratings
4. **`TEST_RATINGS_README.md`** - This file

## 🚀 Usage

### Step 1: Run the Migration (First Time Only)

Run this migration in your Supabase SQL Editor:

```sql
src/supabase/migrations/050_add_test_data_flags.sql
```

This adds the `is_test_data` column to the `ratings` and `sessions` tables.

### Step 2: Add Test Ratings

Run this script in your Supabase SQL Editor:

```sql
ADD_TEST_RATINGS.sql
```

**What it does:**
- **Adds engaging bios** to all tutors without one (permanent)
- Generates 3-10 random ratings per tutor
- Stars range from 3 to 5
- Creates fake bookings with student notes (80% have notes)
- Creates completed sessions for each rating
- **Adds random positive comments** (95% of ratings have comments)
- All ratings/bookings/sessions marked as test data for easy cleanup

### Step 3: Remove Test Ratings (When Done Testing)

Run this script in your Supabase SQL Editor:

```sql
CLEANUP_TEST_RATINGS.sql
```

**What it does:**
- Deletes all ratings marked as test data
- Deletes all sessions marked as test data
- Deletes all bookings marked as test data
- Keeps all real user data intact

## ⚠️ Important Notes

- **Tutor bios are PERMANENT** - They won't be removed by cleanup
- Test bookings are marked with `is_test_data = true`
- Test sessions are marked with `is_test_data = true`
- Test ratings are marked with `is_test_data = true`
- Cleanup script only deletes test data, never real data
- Safe to run multiple times
- Can be re-run to refresh test ratings (bios won't be duplicated)

## 📊 What Gets Generated

**For All Tutors:**
- **Engaging bio** - Professional, friendly descriptions (if they don't have one)
- **15 different bio templates** to choose from

**For Each Tutor:**
- **3-10 random ratings** (varied for realistic distribution)
- **Stars: 3, 4, or 5** (weighted toward higher ratings)
- **Comments:** 30 different positive feedback options (**95% have comments**)
- **Booking notes:** 10 different student request types (80% have notes)
- **Dates:** Random dates within the last 90 days

## 🧹 Cleanup

To remove all test data:

```sql
-- Simply run:
CLEANUP_TEST_RATINGS.sql
```

This will:
1. Count test ratings and sessions
2. Delete all test ratings
3. Delete all test sessions
4. Show summary of what was deleted

## 🔍 Verification

To check how many test ratings exist:

```sql
SELECT COUNT(*) FROM ratings WHERE is_test_data = true;
SELECT COUNT(*) FROM sessions WHERE is_test_data = true;
```

To see a tutor's average rating:

```sql
SELECT 
  tutor_id,
  COUNT(*) as total_ratings,
  AVG(stars) as average_rating
FROM ratings
GROUP BY tutor_id;
```

