-- Check if email_templates table exists and has data

-- 1. Check if table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'email_templates'
);

-- 2. Check table structure
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'email_templates'
ORDER BY ordinal_position;

-- 3. Count rows in table
SELECT COUNT(*) as template_count 
FROM email_templates;

-- 4. View all templates
SELECT id, name, user_type, stage, created_at 
FROM email_templates 
ORDER BY created_at DESC;

-- 5. Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'email_templates';
