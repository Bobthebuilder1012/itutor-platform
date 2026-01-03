-- =====================================================
-- SET EXCLUSIVE ADMIN REVIEWER ACCOUNT
-- =====================================================
-- Account: fa0a6d61-d9d4-4287-a32c-c81021d0ab8b

-- Step 1: Remove reviewer permissions from ALL accounts
UPDATE profiles
SET is_reviewer = false;

-- Step 2: Set fa0a6d61-d9d4-4287-a32c-c81021d0ab8b as the ONLY admin/reviewer
UPDATE profiles
SET is_reviewer = true,
    role = 'admin'
WHERE id = 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b';

-- Step 3: Verify the setup
SELECT 
    id,
    email,
    full_name,
    role,
    is_reviewer,
    created_at
FROM profiles
WHERE id = 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b';

-- Step 4: Confirm ONLY this account has reviewer permissions
SELECT 
    COUNT(*) as total_reviewer_accounts
FROM profiles
WHERE is_reviewer = true;
-- Should return: 1

-- Step 5: Show all accounts (to confirm others don't have reviewer)
SELECT 
    id,
    email,
    full_name,
    role,
    is_reviewer
FROM profiles
ORDER BY created_at DESC
LIMIT 10;






