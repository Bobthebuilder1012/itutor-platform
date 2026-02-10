-- Fix button text color (blue to white) in all email templates
-- This adds !important to ensure white text shows up in email clients

UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '.cta-button { display: inline-block; background: #199358; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }',
  '.cta-button { display: inline-block; background: #199358; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }'
)
WHERE html_content LIKE '%.cta-button%';

-- Verify the update
SELECT id, name, 
  CASE 
    WHEN html_content LIKE '%color: #ffffff !important%' THEN 'Fixed ✓'
    ELSE 'Not Fixed'
  END as button_color_status
FROM email_templates
ORDER BY user_type, stage;
