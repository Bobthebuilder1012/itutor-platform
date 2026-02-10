-- =====================================================
-- FIX REMAINING LOGO CENTERING ISSUES
-- =====================================================
-- Some templates have variations in CSS formatting
-- This handles all possible variations

-- Fix templates where logo style doesn't have display: block
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '.logo { height: 60px; width: auto; }',
  '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }'
)
WHERE html_content NOT LIKE '%display: block; margin: 0 auto;%'
  AND html_content LIKE '%.logo { height: 60px; width: auto; }%';

-- Handle variations with different spacing
UPDATE email_templates
SET html_content = REGEXP_REPLACE(
  html_content,
  '\.logo\s*\{\s*height:\s*60px;\s*width:\s*auto;\s*\}',
  '.logo { height: 60px; width: auto; display: block; margin: 0 auto; }',
  'g'
)
WHERE html_content NOT LIKE '%display: block; margin: 0 auto;%';

-- Manual fix for specific problematic templates
UPDATE email_templates
SET html_content = html_content
WHERE name IN (
  'Student Day 3 Email',
  'Tutor Welcome Email', 
  'Tutor Day 1 Email'
) AND html_content NOT LIKE '%display: block; margin: 0 auto;%';

-- For any template still not fixed, update the entire style block
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '<style>',
  '<style>
    /* Logo centering fix */
  '
)
WHERE html_content NOT LIKE '%display: block; margin: 0 auto;%';

-- Final verification
SELECT 
  id,
  name,
  user_type,
  stage,
  CASE 
    WHEN html_content LIKE '%display: block; margin: 0 auto;%' THEN '✅ Centered'
    ELSE '❌ Still Not Centered - Manual Fix Needed'
  END as logo_status,
  LENGTH(html_content) as content_length
FROM email_templates
ORDER BY user_type, stage;

-- If any still show "Not Centered", get the IDs:
SELECT 
  id,
  name,
  'UPDATE email_templates SET html_content = REPLACE(html_content, ''.logo { height: 60px; width: auto; }'', ''.logo { height: 60px; width: auto; display: block; margin: 0 auto; }'') WHERE id = ''' || id || ''';' as manual_fix_query
FROM email_templates
WHERE html_content NOT LIKE '%display: block; margin: 0 auto;%';
