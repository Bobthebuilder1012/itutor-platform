-- Fix logo centering in all existing email templates
-- This updates the .logo CSS class to include display: block and margin: 0 auto

UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '.logo { height: 60px; width: auto; }',
  '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }'
)
WHERE html_content LIKE '%.logo { height: 60px; width: auto; }%';

-- Verify the update
SELECT id, name, 
  CASE 
    WHEN html_content LIKE '%display: block; margin: 0 auto;%' THEN 'Fixed ✓'
    ELSE 'Not Fixed'
  END as logo_status
FROM email_templates
ORDER BY user_type, stage;
