-- =====================================================
-- UPDATE ALL EMAIL TEMPLATES - Footer & Logo Centering
-- =====================================================
-- Run this in Supabase SQL Editor to update existing templates in the database

-- Update all templates to have:
-- 1. Centered logo (display: block; margin: 0 auto;)
-- 2. New copyright: © iTutor. Nora Digital, Ltd.

UPDATE email_templates
SET html_content = REPLACE(
  REPLACE(
    html_content,
    '.logo { height: 60px; width: auto; }',
    '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }'
  ),
  'iTutor 2026, All rights reserved',
  '© iTutor. Nora Digital, Ltd.'
);

-- Also update any variations
UPDATE email_templates
SET html_content = REPLACE(html_content, 'iTutor 2025, All rights reserved', '© iTutor. Nora Digital, Ltd.')
WHERE html_content LIKE '%iTutor 2025, All rights reserved%';

-- Verify the updates
SELECT 
  id,
  name,
  user_type,
  stage,
  CASE 
    WHEN html_content LIKE '%© iTutor. Nora Digital, Ltd.%' THEN '✅ Updated'
    ELSE '❌ Needs Update'
  END as footer_status,
  CASE 
    WHEN html_content LIKE '%display: block; margin: 0 auto;%' THEN '✅ Centered'
    ELSE '❌ Not Centered'
  END as logo_status,
  updated_at
FROM email_templates
ORDER BY user_type, stage;
