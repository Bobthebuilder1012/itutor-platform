-- =====================================================
-- GET A TEST USER FOR EMAIL TESTING
-- =====================================================
-- Run this to get a real user ID you can test with
-- =====================================================

-- Get 5 most recent users with their details
SELECT 
  id as user_id,
  email,
  full_name,
  role,
  created_at,
  -- Check if they already have welcome email
  (SELECT COUNT(*) FROM email_send_logs WHERE user_id = profiles.id AND stage = 0) as welcome_email_sent
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- Pick a user_id from above (preferably one with welcome_email_sent = 0)
-- Then use it to test the welcome email API
