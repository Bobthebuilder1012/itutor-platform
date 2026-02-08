-- =====================================================
-- REMOVE ALL IN-PERSON REFERENCES FROM EMAIL TEMPLATES
-- =====================================================
-- This script updates all email templates to remove mentions of in-person tutoring

-- Update Tutor Welcome Email
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '✅ Set your availability (online/in-person)',
  '✅ Set your availability'
)
WHERE name = 'Tutor Welcome Email';

-- Update Tutor Day 1 Email - Remove in-person from "Choose Your Mode" section
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '<strong>3. Choose Your Mode</strong><br>Online only, in-person only, or both - you decide!',
  '<strong>3. Set Your Availability</strong><br>Choose the times that work best for your schedule!'
)
WHERE name = 'Tutor Day 1 Email';

-- Update Tutor Day 1 Email - Change the pro tip
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  '<strong>Pro tip:</strong> iTutors who offer both online and in-person get 40% more bookings.',
  '<strong>Pro tip:</strong> iTutors who complete their profiles within 24 hours get their first booking faster!'
)
WHERE name = 'Tutor Day 1 Email';

-- Update Tutor Day 3 Email - Remove "teaching mode" reference
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  'Students look at: Your bio, credentials, response time, and teaching mode.',
  'Students look at: Your bio, credentials, and response time.'
)
WHERE name = 'Tutor Day 3 Email';

-- Update Tutor Day 5 Email example bio - just in case
UPDATE email_templates
SET html_content = REPLACE(
  html_content,
  'I offer flexible online sessions via Zoom.',
  'I offer flexible sessions via Zoom.'
)
WHERE name = 'Tutor Day 5 Email';

-- Verify all changes
SELECT 
  name,
  CASE 
    WHEN html_content LIKE '%in-person%' OR html_content LIKE '%in person%' THEN '⚠️ Still has in-person references'
    WHEN html_content LIKE '%teaching mode%' THEN '⚠️ Still has teaching mode reference'
    ELSE '✅ Clean (no in-person references)'
  END as status
FROM email_templates
WHERE user_type = 'tutor' OR user_type = 'student'
ORDER BY name;
