-- =====================================================
-- COMPARE WORKING VS BROKEN TEMPLATES
-- =====================================================
-- Let's see what's different between templates that work and those that don't

-- Get a working template (Student Day 5 - shows as "Inline Centered")
SELECT 
  name,
  'WORKING TEMPLATE' as status,
  SUBSTRING(html_content FROM POSITION('<img' IN html_content) FOR 300) as img_tag
FROM email_templates
WHERE name = 'Student Day 5 Email';

-- Get a broken template (Tutor Welcome Email - shows as "Not Centered")
SELECT 
  name,
  'BROKEN TEMPLATE' as status,
  SUBSTRING(html_content FROM POSITION('<img' IN html_content) FOR 300) as img_tag
FROM email_templates
WHERE name = 'Tutor Welcome Email';

-- Get another broken one (Student Day 3)
SELECT 
  name,
  'BROKEN TEMPLATE' as status,
  SUBSTRING(html_content FROM POSITION('<img' IN html_content) FOR 300) as img_tag
FROM email_templates
WHERE name = 'Student Day 3 Email';

-- Show the full header section for working template
SELECT 
  name,
  SUBSTRING(html_content FROM POSITION('<div class="header">' IN html_content) FOR 400) as header_section
FROM email_templates
WHERE name = 'Student Day 5 Email';

-- Show the full header section for broken template
SELECT 
  name,
  SUBSTRING(html_content FROM POSITION('<div class="header">' IN html_content) FOR 400) as header_section
FROM email_templates
WHERE name = 'Tutor Welcome Email';
