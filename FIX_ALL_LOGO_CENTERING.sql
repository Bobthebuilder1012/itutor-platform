-- Fix all logo centering issues in email templates
-- This will work regardless of current formatting

-- Method 1: Add display and margin if they don't exist
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  '(\.logo\s*\{\s*height:\s*60px;\s*width:\s*auto;)\s*\}',
  '\1 display: block; margin: 0 auto; }',
  'g'
)
WHERE html_content LIKE '%.logo%'
  AND html_content NOT LIKE '%margin: 0 auto%';

-- Method 2: For templates with inline logo styles
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  '<img([^>]*class="logo"[^>]*)>',
  '<img\1 style="display: block; margin: 0 auto;">',
  'g'
)
WHERE html_content LIKE '%class="logo"%'
  AND html_content NOT LIKE '%style="display: block; margin: 0 auto%';

-- Method 3: Nuclear option - replace any logo img tag
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  '<img src="https://myitutor\.com/assets/logo/itutor-logo-dark\.png" alt="iTutor" class="logo" />',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="display: block; margin: 0 auto; height: 60px; width: auto;" />',
  'g'
)
WHERE html_content LIKE '%itutor-logo-dark.png%';

-- Verify all logos are now centered
SELECT id, name,
  CASE 
    WHEN html_content LIKE '%margin: 0 auto%' OR html_content LIKE '%margin:0 auto%' THEN 'Centered ✓'
    ELSE 'Not Centered ❌'
  END as logo_status
FROM email_templates
ORDER BY user_type, stage;
