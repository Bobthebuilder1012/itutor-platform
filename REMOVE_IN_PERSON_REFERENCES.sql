-- Remove all references to in-person sessions from email templates
-- iTutor only offers online sessions via Google Meet or Zoom

-- Remove mentions of "in-person" and "in person"
UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  'online/in-person',
  'online',
  'gi'
);

UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  'in-person or online',
  'online',
  'gi'
);

UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  'online or in-person',
  'online',
  'gi'
);

UPDATE email_templates
SET html_content = regexp_replace(
  html_content,
  'in person',
  'online',
  'gi'
);

-- Specific fixes for common phrases
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  'iTutors who offer both online and in-person get 40% more bookings',
  'Online sessions are flexible and convenient for everyone'
);

UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  'Set your availability (online/in-person)',
  'Set your online availability'
);

-- Verify changes
SELECT id, name,
  CASE 
    WHEN html_content ILIKE '%in-person%' OR html_content ILIKE '%in person%' THEN 'Still has in-person ❌'
    ELSE 'Clean ✓'
  END as in_person_status
FROM email_templates
ORDER BY user_type, stage;
