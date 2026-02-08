-- =====================================================
-- GET FULL HTML FOR BROKEN TEMPLATES
-- =====================================================
-- Export the full HTML so we can see exactly what's wrong

-- Get complete HTML content for the 3 broken templates
SELECT 
  name,
  html_content
FROM email_templates
WHERE name IN (
  'Student Day 3 Email',
  'Tutor Welcome Email',
  'Tutor Day 1 Email'
)
ORDER BY name;

-- Also get one working template for comparison
SELECT 
  name,
  html_content
FROM email_templates
WHERE name = 'Student Day 5 Email';
