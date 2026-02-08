-- =====================================================
-- COPY WORKING LOGO HTML TO BROKEN TEMPLATES
-- =====================================================
-- Extract the exact working img tag and copy it to broken templates

-- First, let's see what the working templates have
SELECT 
  name,
  SUBSTRING(html_content FROM POSITION('itutor-logo-dark.png' IN html_content) - 50 FOR 200) as logo_context
FROM email_templates
WHERE name IN ('Student Day 5 Email', 'Student Day 7 Email', 'Tutor Day 5 Email')
LIMIT 3;

-- Now let's see what the broken templates have  
SELECT 
  name,
  SUBSTRING(html_content FROM POSITION('itutor-logo-dark.png' IN html_content) - 50 FOR 200) as logo_context
FROM email_templates
WHERE name IN ('Student Day 3 Email', 'Tutor Welcome Email', 'Tutor Day 1 Email')
LIMIT 3;
