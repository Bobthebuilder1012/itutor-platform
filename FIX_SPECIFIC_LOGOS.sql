-- =====================================================
-- FIX SPECIFIC LOGO CENTERING ISSUES
-- =====================================================
-- Direct fix for the 5 templates that still need inline styles

-- Fix Student Welcome Email
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img[^>]*itutor-logo-dark\.png"[^>]*class="logo"[^>]*/?>',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE name = 'Student Welcome Email';

-- Fix Student Day 1 Email
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img[^>]*itutor-logo-dark\.png"[^>]*class="logo"[^>]*/?>',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE name = 'Student Day 1 Email';

-- Fix Student Day 3 Email
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img[^>]*itutor-logo-dark\.png"[^>]*class="logo"[^>]*/?>',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE name = 'Student Day 3 Email';

-- Fix Tutor Welcome Email
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img[^>]*itutor-logo-dark\.png"[^>]*class="logo"[^>]*/?>',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE name = 'Tutor Welcome Email';

-- Fix Tutor Day 1 Email
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '<img[^>]*itutor-logo-dark\.png"[^>]*class="logo"[^>]*/?>',
  '<img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />',
  'g'
)
WHERE name = 'Tutor Day 1 Email';

-- Verify all are now fixed
SELECT 
  id,
  name,
  user_type,
  stage,
  CASE 
    WHEN html_content LIKE '%<img%style="%display: block; margin: 0 auto%' THEN '✅ Inline Centered'
    WHEN html_content LIKE '%display: block; margin: 0 auto;%' THEN '⚠️ CSS Only'
    ELSE '❌ Not Centered'
  END as logo_status,
  updated_at
FROM email_templates
ORDER BY user_type, stage;
