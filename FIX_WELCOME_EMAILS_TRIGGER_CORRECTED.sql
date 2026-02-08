-- =====================================================
-- FIX: Auto-Queue Onboarding Emails via Database Trigger (CORRECTED)
-- =====================================================
-- This trigger automatically creates an email queue entry when a user signs up
-- The queue entry tracks the user's progress through the email sequence

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION queue_onboarding_email_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue emails for student, tutor, and parent roles
  IF NEW.role IN ('student', 'tutor', 'parent') THEN
    
    -- Create ONE queue entry per user at stage 0 (welcome email)
    -- The cron job will send the email and increment the stage automatically
    INSERT INTO onboarding_email_queue (
      user_id, 
      user_type, 
      stage, 
      next_send_at, 
      is_active
    )
    VALUES (
      NEW.id,           -- user_id
      NEW.role,         -- user_type
      0,                -- stage 0 = welcome email
      NOW(),            -- send immediately
      true              -- active
    )
    ON CONFLICT (user_id) DO NOTHING; -- Prevent duplicates
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to profiles table
DROP TRIGGER IF EXISTS auto_queue_onboarding_on_signup ON profiles;

CREATE TRIGGER auto_queue_onboarding_on_signup
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION queue_onboarding_email_on_signup();

-- 3. Verify trigger was created
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'auto_queue_onboarding_on_signup';

-- 4. Backfill queue entries for recent users (last 7 days) who don't have entries
INSERT INTO onboarding_email_queue (
  user_id, 
  user_type, 
  stage, 
  next_send_at, 
  is_active
)
SELECT 
  p.id,            -- user_id
  p.role,          -- user_type
  0,               -- stage 0 = welcome email
  NOW(),           -- send immediately
  true             -- active
FROM profiles p
WHERE p.created_at > NOW() - INTERVAL '7 days'
  AND p.role IN ('student', 'tutor', 'parent')
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_email_queue q
    WHERE q.user_id = p.id
  );

-- 5. Check results
SELECT 
  'Recent signups (last 7 days)' as metric,
  COUNT(*) as count
FROM profiles 
WHERE created_at > NOW() - INTERVAL '7 days'
  AND role IN ('student', 'tutor', 'parent');

SELECT 
  'Queue entries created' as metric,
  COUNT(*) as count
FROM onboarding_email_queue
WHERE created_at > NOW() - INTERVAL '7 days';

SELECT 
  'Active queue entries' as metric,
  COUNT(*) as count
FROM onboarding_email_queue
WHERE is_active = true;

-- 6. Show what was queued
SELECT 
  q.user_id,
  p.email,
  p.role as user_type,
  q.stage,
  q.next_send_at,
  q.is_active,
  p.created_at as user_created_at
FROM onboarding_email_queue q
JOIN profiles p ON p.id = q.user_id
WHERE p.created_at > NOW() - INTERVAL '7 days'
ORDER BY p.created_at DESC;
