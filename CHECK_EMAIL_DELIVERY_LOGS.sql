-- =====================================================
-- CHECK EMAIL DELIVERY LOGS
-- Run this in Supabase SQL Editor
-- =====================================================

-- Check recent signup/email events for the school email address
-- Replace 'school-email@university.edu' with the actual school email

-- Query 1: Check if user was created
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_app_meta_data->>'provider' as provider,
  confirmation_sent_at
FROM auth.users
WHERE email = 'school-email@university.edu'  -- REPLACE WITH ACTUAL SCHOOL EMAIL
ORDER BY created_at DESC;

-- Query 2: Check auth audit logs for email-related events
SELECT 
  created_at,
  level,
  msg,
  (metadata->>'email') as email,
  (metadata->>'error') as error,
  (metadata->>'provider') as provider
FROM auth.audit_log_entries
WHERE (metadata->>'email') = 'school-email@university.edu'  -- REPLACE WITH ACTUAL SCHOOL EMAIL
   OR msg LIKE '%school-email%'  -- REPLACE WITH PART OF SCHOOL EMAIL
ORDER BY created_at DESC
LIMIT 50;

-- Query 3: Check ALL recent email events (last 24 hours)
SELECT 
  created_at,
  level,
  msg,
  (metadata->>'email') as email,
  (metadata->>'error') as error
FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (msg ILIKE '%email%' OR msg ILIKE '%mail%' OR msg ILIKE '%smtp%')
ORDER BY created_at DESC
LIMIT 100;

-- Query 4: Check rate limit events
SELECT 
  created_at,
  level,
  msg,
  metadata
FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (msg ILIKE '%rate%' OR msg ILIKE '%limit%')
ORDER BY created_at DESC
LIMIT 20;

-- Query 5: Compare personal email vs school email events
SELECT 
  created_at,
  level,
  msg,
  (metadata->>'email') as email,
  (metadata->>'error') as error
FROM auth.audit_log_entries
WHERE (
  (metadata->>'email') = 'personal-email@gmail.com'  -- REPLACE WITH ACTUAL PERSONAL EMAIL
  OR (metadata->>'email') = 'school-email@university.edu'  -- REPLACE WITH ACTUAL SCHOOL EMAIL
)
ORDER BY created_at DESC
LIMIT 50;

-- =====================================================
-- EXPECTED RESULTS:
-- =====================================================
-- If email was sent successfully:
--   - msg: "Email sent" or similar
--   - level: "info"
--   - No error in metadata
--
-- If rate limited:
--   - msg: "Rate limit exceeded"
--   - level: "warning"
--
-- If email bounced/rejected:
--   - msg: "Email delivery failed"
--   - error: reason for failure
--
-- If email not sent at all:
--   - No matching records (very unusual)
-- =====================================================

