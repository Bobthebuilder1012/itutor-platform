-- Test if admin can query email_templates
-- This simulates what the API does

-- First, verify you're logged in as admin
SELECT 
    auth.uid() as current_user_id,
    p.email,
    p.role,
    p.is_reviewer
FROM profiles p
WHERE p.id = auth.uid();

-- Now try to fetch templates (this is what the API does)
-- If this works here but fails in the API, it's an auth issue
SELECT 
    id, 
    name, 
    subject, 
    user_type, 
    stage, 
    created_at 
FROM email_templates
ORDER BY created_at DESC
LIMIT 10;
