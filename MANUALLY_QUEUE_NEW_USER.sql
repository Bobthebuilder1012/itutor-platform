-- =====================================================
-- EMERGENCY: Manually Send Welcome Email to New User
-- =====================================================
-- Use this to immediately queue the new user who's waiting

-- 1. Find the newest user who signed up recently
SELECT 
  id,
  email,
  full_name,
  role,
  created_at,
  'User to queue →' as action
FROM profiles
WHERE created_at > NOW() - INTERVAL '2 hours'
  AND role IN ('student', 'tutor', 'parent')
ORDER BY created_at DESC
LIMIT 5;

-- 2. Copy the user ID from above, then run this:
-- Replace 'USER_ID_HERE' with the actual ID

INSERT INTO onboarding_email_queue (
  user_id,
  user_type,
  stage,
  next_send_at,
  is_active
)
VALUES (
  'USER_ID_HERE',    -- ← REPLACE THIS with user ID from query above
  'student',         -- ← Change to 'tutor' or 'parent' if needed
  0,                 -- Stage 0 = welcome email
  NOW(),             -- Send immediately
  true               -- Active
)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Verify it was added
SELECT 
  q.user_id,
  p.email,
  p.full_name,
  q.user_type,
  q.stage,
  q.next_send_at,
  q.is_active,
  '✅ Queued and ready' as status
FROM onboarding_email_queue q
JOIN profiles p ON p.id = q.user_id
WHERE q.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY q.created_at DESC;

-- =====================================================
-- NOTES:
-- =====================================================
-- After adding to queue:
-- 1. The cron job will pick it up within 15 minutes
-- 2. OR deploy the fixed cron job code first for immediate processing
-- 3. Check email inbox after 15 minutes
--
-- If you want to manually trigger the cron RIGHT NOW:
-- Call this URL with Authorization header containing CRON_SECRET:
-- GET https://your-domain.vercel.app/api/cron/send-onboarding-emails
