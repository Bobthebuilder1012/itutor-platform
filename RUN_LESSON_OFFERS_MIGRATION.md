# Fix Lesson Offers System

## Problem
The `lesson_offers` table doesn't exist or has incorrect column names, causing the offers system to fail.

## Solution
Run the corrected migration file to create the `lesson_offers` table with the proper structure.

## Steps

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `nfkrfciozjxrodkusrhh`

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run the Migration**
   - Click "New query"
   - Copy the entire contents of `src/supabase/migrations/016_lesson_offers_system_FIXED.sql`
   - Paste it into the SQL editor
   - Click "Run" or press `Ctrl+Enter`

4. **Verify Success**
   - You should see: `Lesson offers table created successfully`
   - Check the Tables section to confirm `lesson_offers` table exists with these columns:
     - `id` (UUID)
     - `tutor_id` (UUID)
     - `student_id` (UUID)
     - `subject_id` (UUID)
     - `proposed_start_at` (TIMESTAMPTZ)
     - `duration_minutes` (INTEGER)
     - `tutor_note` (TEXT)
     - `status` (TEXT)
     - `counter_proposed_start_at` (TIMESTAMPTZ)
     - `counter_tutor_note` (TEXT)
     - `created_at` (TIMESTAMPTZ)
     - `updated_at` (TIMESTAMPTZ)

5. **Test the System**
   - Refresh your iTutor application
   - The "Offers Received" and "Sent Offers" sections should now work without errors

## What This Migration Does

1. **Drops old table** if it exists (to clean up any previous attempts)
2. **Creates `lesson_offers` table** with proper foreign key relationships
3. **Sets up indexes** for performance
4. **Enables RLS** (Row Level Security) with policies for tutors and students
5. **Creates triggers** for `updated_at` timestamp and notifications

## Notes

- The migration will drop any existing `lesson_offers` table, so run this only if you haven't entered important data yet.
- If you have existing data, let me know and I'll create a migration that preserves it.







