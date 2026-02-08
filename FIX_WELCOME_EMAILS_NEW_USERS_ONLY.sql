-- =====================================================
-- FIX: Auto-Queue Onboarding Emails for NEW Signups Only
-- =====================================================
-- This trigger will work for all FUTURE signups
-- Does NOT backfill existing users

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
  action_statement,
  '✅ Trigger created successfully!' as status
FROM information_schema.triggers
WHERE trigger_name = 'auto_queue_onboarding_on_signup';

-- 4. Test the trigger is active
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers 
      WHERE trigger_name = 'auto_queue_onboarding_on_signup'
    )
    THEN '✅ TRIGGER ACTIVE - All new signups will automatically queue welcome emails'
    ELSE '❌ TRIGGER NOT FOUND - Something went wrong'
  END as trigger_status;

-- =====================================================
-- OPTIONAL: Manually Queue Emails for Specific Users
-- =====================================================
-- If you want to send welcome emails to specific recent users,
-- uncomment and modify the section below:

/*
-- Example: Queue welcome email for a specific user by email
INSERT INTO onboarding_email_queue (
  user_id, 
  user_type, 
  stage, 
  next_send_at, 
  is_active
)
SELECT 
  p.id,
  p.role,
  0,
  NOW(),
  true
FROM profiles p
WHERE p.email = 'user@example.com'  -- Replace with actual email
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_email_queue q WHERE q.user_id = p.id
  );
*/

-- =====================================================
-- NOTES:
-- =====================================================
-- ✅ Existing users will NOT receive any emails
-- ✅ Only NEW signups (after this trigger is created) will get emails
-- ✅ If you want to send to specific users, use the optional section above
-- ✅ The cron job runs every 15 minutes and will send queued emails
