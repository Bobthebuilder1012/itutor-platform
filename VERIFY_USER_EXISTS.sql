-- =====================================================
-- VERIFY IF USER EXISTS
-- =====================================================
-- Copy the user_id from the error and check if it really exists
-- =====================================================

-- Check if this specific user exists
SELECT 
  id,
  email,
  full_name,
  role,
  created_at
FROM profiles
WHERE id = '63b28d67-cc7b-4f88-b34f-57a8a409cd4d';

-- If the above returns EMPTY (0 rows), the user doesn't exist!
-- Run this to get a user that ACTUALLY exists:

SELECT 
  id,
  email,
  full_name,
  role,
  created_at
FROM profiles
WHERE email IS NOT NULL
  AND full_name IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- Copy one of the 'id' values from above and use THAT in the test page!
