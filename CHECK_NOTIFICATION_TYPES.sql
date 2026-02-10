-- Check what notification types are allowed
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE '%notification%type%';

-- Also check the actual constraint definition
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname LIKE '%notification%type%'
  AND conrelid = 'notifications'::regclass;
