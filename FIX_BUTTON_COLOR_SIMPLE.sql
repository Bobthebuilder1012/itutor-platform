-- Fix button text color (blue to white) in all email templates
-- Using a simpler approach with regexp_replace

UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  'color: #ffffff;',
  'color: #ffffff !important;',
  'g'
)
WHERE html_content LIKE '%.cta-button%'
  AND html_content NOT LIKE '%color: #ffffff !important%';

-- Verify the update
SELECT id, name, 
  CASE 
    WHEN html_content LIKE '%color: #ffffff !important%' THEN 'Fixed ✓'
    ELSE 'Not Fixed'
  END as button_color_status
FROM email_templates
ORDER BY user_type, stage;
