-- =====================================================
-- SETUP EXCLUSIVE ADMIN REVIEWER ACCOUNT
-- =====================================================
-- This script sets up ONE account as the exclusive admin/reviewer
-- All other accounts will have is_reviewer removed

-- Step 1: Remove reviewer permissions from ALL accounts
UPDATE profiles
SET is_reviewer = false;

-- Step 2: Set the specific account as the ONLY reviewer
-- Replace 'YOUR_ACCOUNT_ID' with the actual UUID of the account you just created
UPDATE profiles
SET is_reviewer = true,
    role = 'admin'  -- Optional: change role to 'admin' instead of 'student'
WHERE id = 'YOUR_ACCOUNT_ID';

-- Step 3: Verify the setup
SELECT 
    id,
    email,
    full_name,
    role,
    is_reviewer,
    created_at
FROM profiles
WHERE is_reviewer = true;

-- This should return ONLY ONE account - your admin reviewer

-- Step 4: Check that all other accounts have is_reviewer = false
SELECT 
    COUNT(*) as total_accounts,
    COUNT(CASE WHEN is_reviewer = true THEN 1 END) as reviewer_accounts,
    COUNT(CASE WHEN is_reviewer = false OR is_reviewer IS NULL THEN 1 END) as non_reviewer_accounts
FROM profiles;

-- Expected result: 
-- reviewer_accounts = 1 (your admin account)
-- non_reviewer_accounts = all others

RAISE NOTICE '✅ Admin reviewer account set up successfully!';
RAISE NOTICE '⚠️  Remember to logout and login again for changes to take effect';













