-- =====================================================
-- FIX LOGO CENTERING - Add Inline Styles to IMG Tag
-- =====================================================
-- The CSS class isn't working, so we'll add inline styles directly to the img tag

-- Update all img tags with class="logo" to have inline centering styles
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />'
);

-- Also handle dynamic URL versions
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img src="[^"]*itutor-logo-dark\.png" alt="iTutor" class="logo" />',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE html_content NOT LIKE '%style="height: 60px; width: auto; display: block; margin: 0 auto;"%';

-- Verify all templates now have inline styles on img tag
SELECT 
  id,
  name,
  user_type,
  stage,
  CASE 
    WHEN html_content LIKE '%<img%style="height: 60px; width: auto; display: block; margin: 0 auto;"%' THEN '✅ Inline Centered'
    WHEN html_content LIKE '%display: block; margin: 0 auto;%' THEN '⚠️ CSS Only (may not work)'
    ELSE '❌ Not Centered'
  END as logo_status
FROM email_templates
ORDER BY user_type, stage;
