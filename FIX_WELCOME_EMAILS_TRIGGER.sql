-- =====================================================
-- FIX: Auto-Queue Onboarding Emails via Database Trigger
-- =====================================================
-- This trigger automatically queues welcome emails when a user signs up
-- No code changes needed - works immediately!

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION queue_onboarding_emails_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue emails for student, tutor, and parent roles
  IF NEW.role IN ('student', 'tutor', 'parent') THEN
    
    -- Queue welcome email (stage 0 - send immediately)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 0, NOW(), 'pending');
    
    -- Queue Day 1 email (24 hours after signup)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 1, NOW() + INTERVAL '24 hours', 'pending');
    
    -- Queue Day 3 email (72 hours after signup)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 3, NOW() + INTERVAL '72 hours', 'pending');
    
    -- Queue Day 5 email (120 hours / 5 days after signup)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 5, NOW() + INTERVAL '120 hours', 'pending');
    
    -- Queue Day 7 email (168 hours / 7 days after signup)
    INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
    VALUES (NEW.id, NEW.role, 7, NOW() + INTERVAL '168 hours', 'pending');
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to profiles table
DROP TRIGGER IF EXISTS auto_queue_onboarding_emails ON profiles;

CREATE TRIGGER auto_queue_onboarding_emails
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION queue_onboarding_emails_trigger();

-- 3. Verify trigger was created
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'auto_queue_onboarding_emails';

-- 4. Backfill emails for recent users (last 7 days) who didn't get emails
INSERT INTO onboarding_email_queue (user_id, user_type, stage, scheduled_for, status)
SELECT 
  p.id as user_id,
  p.role as user_type,
  0 as stage,
  NOW() as scheduled_for,
  'pending' as status
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
  AND role IN ('student', 'tutor', 'parent')

UNION ALL

SELECT 
  'Emails queued' as metric,
  COUNT(*) as count
FROM onboarding_email_queue
WHERE created_at > NOW() - INTERVAL '7 days';
