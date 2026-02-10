-- Check if email tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('onboarding_email_queue', 'email_send_logs')
ORDER BY table_name;

-- If tables exist, check their structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('onboarding_email_queue', 'email_send_logs')
ORDER BY table_name, ordinal_position;
