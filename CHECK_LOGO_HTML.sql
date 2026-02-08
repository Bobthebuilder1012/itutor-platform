-- Check the actual img tag HTML in templates
SELECT 
  name,
  user_type,
  stage,
  SUBSTRING(html_content FROM POSITION('<img' IN html_content) FOR 200) as img_tag_snippet
FROM email_templates
WHERE name LIKE '%Welcome%'
ORDER BY user_type, stage;
