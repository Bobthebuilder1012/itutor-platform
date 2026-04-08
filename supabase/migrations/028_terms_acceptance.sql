-- =====================================================
-- TERMS & CONDITIONS ACCEPTANCE
-- =====================================================
-- Adds fields to track when users accept terms and conditions

-- Step 1: Add terms acceptance fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Step 2: Set existing users as having accepted terms (grandfather clause)
UPDATE profiles
SET terms_accepted = TRUE,
    terms_accepted_at = created_at
WHERE terms_accepted IS NULL OR terms_accepted = FALSE;

-- Step 3: Make terms_accepted NOT NULL with default FALSE for new users
ALTER TABLE profiles
ALTER COLUMN terms_accepted SET DEFAULT FALSE;

ALTER TABLE profiles
ALTER COLUMN terms_accepted SET NOT NULL;

-- Step 4: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_terms_accepted ON profiles(terms_accepted);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Terms acceptance tracking added successfully!';
  RAISE NOTICE '✅ Existing users marked as accepted (grandfathered)';
  RAISE NOTICE '✅ New users will be required to accept terms during signup';
END $$;













