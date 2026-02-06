-- Comprehensive check for admin access to email templates

-- 1. Check if templates were inserted
SELECT COUNT(*) as total_templates FROM email_templates;

-- 2. View all templates
SELECT id, name, user_type, stage, created_at 
FROM email_templates 
ORDER BY user_type, stage;

-- 3. Check if admin@myitutor.com has admin role
SELECT id, email, role, is_reviewer 
FROM profiles 
WHERE email = 'admin@myitutor.com';

-- 4. Check ALL profiles with admin role
SELECT id, email, role, is_reviewer, created_at 
FROM profiles 
WHERE role = 'admin'
ORDER BY created_at DESC;

-- 5. Check if RLS is enabled on email_templates
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'email_templates';
