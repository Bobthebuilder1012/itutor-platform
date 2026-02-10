-- Check current templates and identify duplicates

-- 1. See all templates grouped by name
SELECT 
  name,
  user_type,
  stage,
  COUNT(*) as duplicate_count,
  MIN(created_at) as oldest_created,
  MAX(created_at) as newest_created
FROM email_templates
GROUP BY name, user_type, stage
ORDER BY user_type, stage;

-- 2. See which templates we should have
-- Student: Welcome (stage 0), Day 1 (stage 1), Day 3 (stage 3)
-- Tutor: Welcome (stage 0), Day 1 (stage 1)

-- 3. View all template IDs
SELECT id, name, user_type, stage, created_at
FROM email_templates
ORDER BY user_type, stage, created_at;
