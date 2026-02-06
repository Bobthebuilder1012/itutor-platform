-- =====================================================
-- TEST WELCOME EMAIL SYSTEM
-- =====================================================
-- Run these queries in order to test the email system
-- =====================================================

-- STEP 1: Check if email tables exist
SELECT 
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('onboarding_email_queue', 'email_send_logs');

-- Expected: Should return 2 rows
-- If EMPTY, you need to run the migrations first!


-- STEP 2: Get a test user ID (pick a recent signup)
SELECT 
  id,
  email,
  full_name,
  role,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- Copy one of the 'id' values to use in Step 3


-- STEP 3: Check if user has email logs already
-- Replace 'USER_ID_HERE' with actual ID from Step 2
SELECT * FROM email_send_logs 
WHERE user_id = 'USER_ID_HERE'
ORDER BY created_at DESC;


-- STEP 4: Check email queue for user
-- Replace 'USER_ID_HERE' with actual ID from Step 2
SELECT * FROM onboarding_email_queue 
WHERE user_id = 'USER_ID_HERE';


-- STEP 5: After calling the API endpoint, check logs again
-- Replace 'USER_ID_HERE' with actual ID
SELECT 
  stage,
  email_type,
  status,
  error_message,
  created_at
FROM email_send_logs 
WHERE user_id = 'USER_ID_HERE'
ORDER BY created_at DESC;
