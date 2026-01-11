# Add Biography Column Migration

## Error
When trying to edit profile bio, you get:
```
Could not find the 'bio' column of 'profiles' in the schema cache
```

## Solution
The `bio` column doesn't exist in the profiles table yet. Run the migration to add it.

## Steps

1. **Open Supabase SQL Editor**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor** (left sidebar)

2. **Run the Migration**
   - Open the file: `src/supabase/migrations/017_add_bio_column.sql`
   - Copy all the SQL code
   - Paste it into the Supabase SQL Editor
   - Click **Run**

3. **Verify Success**
   - You should see a message: "Biography column added successfully!"
   - The query results should show the new `bio` column details

4. **Test the Fix**
   - Go back to your iTutor app
   - Try editing your profile and adding a biography
   - Click "Save Changes"
   - The error should be gone and your bio should save successfully! ✅

## What This Does
- Adds a `bio` TEXT column to the `profiles` table
- Allows storing user biographies up to ~1000 characters
- Supports emojis and multiline text
- Column is nullable (optional field)












