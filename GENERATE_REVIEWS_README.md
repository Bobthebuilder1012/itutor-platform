# Generate Random Tutor Reviews

## Overview
This script generates realistic random ratings and reviews for all tutors in your iTutor platform.

## Features
- ⭐ Creates 3-12 reviews per tutor
- 📊 Ratings weighted towards higher scores (40% 5-star, 35% 4-star, 20% 3-star, 5% 2-star)
- 💬 Realistic review comments that match the star rating
- 📅 Reviews spread over the last 90 days
- 👥 Uses existing student accounts (so reviews are from real users in your system)

## Requirements
- You must have **existing student accounts** in your database
- The script uses these real students to create reviews
- If you have no students, the script will fail with a helpful error message

## How to Use

### Step 1: Run the Script
1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `GENERATE_TUTOR_REVIEWS.sql`
4. Paste into the SQL Editor
5. Click **Run**

### Step 2: Review Results
After running, you'll see:
- A summary table showing each tutor's:
  - Total reviews
  - Average rating
  - Breakdown by star rating (5-star, 4-star, etc.)
- Success message: "Random tutor reviews generated successfully! ⭐"

## Sample Output
```
tutor_name          | total_reviews | average_rating | five_stars | four_stars | three_stars
--------------------|---------------|----------------|------------|------------|-------------
Jane Smith          | 10            | 4.50           | 5          | 4          | 1
John Doe            | 8             | 4.75           | 6          | 2          | 0
Sarah Johnson       | 12            | 4.25           | 4          | 6          | 2
```

## Review Comment Examples

### 5-Star Reviews:
- "Excellent tutor! Very patient and explains concepts clearly."
- "Fantastic tutor! My understanding improved significantly."
- "Couldn't have passed my exams without this tutor!"

### 4-Star Reviews:
- "Great teaching style, makes learning enjoyable."
- "Very knowledgeable and prepared for each session."
- "Clear explanations and good at breaking down complex topics."

### 3-Star Reviews:
- "Patient and understanding, helped me grasp difficult topics."
- "Helpful sessions, but sometimes hard to schedule."

### 2-Star Reviews:
- "Sessions were okay, but not what I expected."
- "Had some technical issues during our lessons."

## Important Notes
- ⚠️ This is for **testing/development purposes**
- 🔄 You can run it multiple times (duplicate reviews are automatically skipped)
- 🗑️ To clear all reviews and start fresh, run:
  ```sql
  DELETE FROM public.ratings;
  ```

## What It Does Behind the Scenes
1. Finds all existing students in your database
2. For each tutor:
   - Generates a random number of reviews (3-12)
   - Picks random students as reviewers
   - Assigns star ratings (weighted towards positive)
   - Selects appropriate comments based on rating
   - Spreads reviews across the last 90 days
3. Handles duplicates gracefully (skips if a student already reviewed that tutor)

## Temporary Solution
> **Note**: This is a temporary solution for testing. In the future, you'll want to implement a real review system where students can leave genuine reviews after completing sessions with tutors.

## Need to Remove Reviews?
To delete all generated reviews:
```sql
DELETE FROM public.ratings;
```

To delete reviews for a specific tutor:
```sql
DELETE FROM public.ratings WHERE tutor_id = 'tutor-uuid-here';
```







