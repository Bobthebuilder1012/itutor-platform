-- =====================================================
-- ENFORCE USERNAME UNIQUENESS
-- =====================================================
-- Ensures all usernames are unique across the entire system
-- No two users (student, tutor, parent, or admin) can have the same username

-- Step 1: Drop existing unique constraints if they exist
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_unique;

-- Step 2: Update any NULL usernames to temporary unique values
UPDATE profiles
SET username = 'user_' || id
WHERE username IS NULL;

-- Step 3: Handle any duplicate usernames by appending user ID
WITH duplicates AS (
  SELECT username, array_agg(id ORDER BY created_at) as user_ids
  FROM profiles
  WHERE username IS NOT NULL
  GROUP BY username
  HAVING COUNT(*) > 1
)
UPDATE profiles p
SET username = p.username || '_' || p.id
FROM duplicates d
WHERE p.username = d.username
  AND p.id = ANY(d.user_ids[2:]);  -- Keep first user with original username

-- Step 4: Add unique constraint on username (drop first in case it exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- Step 5: Make username NOT NULL
DO $$
BEGIN
  ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'username column already NOT NULL or error occurred';
END $$;

-- Step 6: Add index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Step 7: Add constraint to ensure username format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-zA-Z0-9_-]+$');
  END IF;
END $$;

-- Step 8: Add constraint to ensure username length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_length'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_length CHECK (length(username) >= 6 AND length(username) <= 30);
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Username uniqueness constraint added successfully!';
  RAISE NOTICE '✅ All usernames are now unique across the system';
  RAISE NOTICE '✅ Username format: 6-30 characters, alphanumeric with _ and -';
END $$;

