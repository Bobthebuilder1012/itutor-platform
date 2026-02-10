-- Nuclear option: Delete all templates and re-insert with fixed logo
-- Use this if the other methods don't work

-- 1. Delete all existing templates
DELETE FROM email_templates;

-- 2. Reset the sequence (optional, for clean IDs)
-- This ensures new templates start from ID 1
-- ALTER SEQUENCE email_templates_id_seq RESTART WITH 1;

-- 3. Now run POPULATE_EMAIL_TEMPLATES.sql which has the fixed logo CSS

-- Verify deletion
SELECT COUNT(*) as remaining_templates FROM email_templates;
