-- Clean up duplicate email templates
-- Keep only the most recent version of each unique template

-- Step 1: Delete duplicates, keeping only the newest version
WITH ranked_templates AS (
  SELECT 
    id,
    name,
    user_type,
    stage,
    ROW_NUMBER() OVER (
      PARTITION BY name, user_type, stage 
      ORDER BY created_at DESC
    ) as rn
  FROM email_templates
)
DELETE FROM email_templates
WHERE id IN (
  SELECT id 
  FROM ranked_templates 
  WHERE rn > 1
);

-- Step 2: Verify we now have exactly 5 unique templates
SELECT 
  name,
  user_type,
  stage,
  COUNT(*) as count
FROM email_templates
GROUP BY name, user_type, stage
ORDER BY user_type, stage;

-- Step 3: Show final template list
SELECT id, name, user_type, stage, created_at
FROM email_templates
ORDER BY user_type, stage;

-- Expected result: 5 templates total
-- Student: Welcome (0), Day 1 (1), Day 3 (3)
-- Tutor: Welcome (0), Day 1 (1)
