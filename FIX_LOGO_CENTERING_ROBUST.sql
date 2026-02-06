-- More robust fix for logo centering
-- This handles variations in spacing and formatting

-- First, let's see what the actual CSS looks like in the unfixed templates
SELECT id, name, 
  SUBSTRING(html_content FROM position('.logo' in html_content) FOR 100) as logo_css_snippet
FROM email_templates
WHERE html_content NOT LIKE '%display: block; margin: 0 auto;%'
LIMIT 5;

-- Now update all templates that don't have the centered logo
-- This uses a more flexible approach
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  '\.logo \{ height: 60px; width: auto; \}',
  '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }',
  'g'
)
WHERE html_content LIKE '%.logo { height: 60px; width: auto; }%'
  AND html_content NOT LIKE '%display: block; margin: 0 auto;%';

-- Alternative: Update by directly finding and replacing the logo class definition
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  '\.logo\s*\{\s*height:\s*60px;\s*width:\s*auto;\s*\}',
  '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }',
  'g'
)
WHERE html_content NOT LIKE '%margin: 0 auto%';

-- Verify all templates are now fixed
SELECT id, name, 
  CASE 
    WHEN html_content LIKE '%display: block; margin: 0 auto%' THEN 'Fixed ✓'
    ELSE 'Not Fixed ❌'
  END as logo_status
FROM email_templates
ORDER BY user_type, stage;
