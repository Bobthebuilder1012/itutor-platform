-- =====================================================
-- CHECK WHAT SUBJECTS EXIST IN YOUR DATABASE
-- =====================================================
-- Run this first to see what subjects are available

-- Check if subjects table has any data
SELECT COUNT(*) as total_subjects FROM subjects;

-- View all CSEC subjects
SELECT id, name, curriculum, level, label, code
FROM subjects
WHERE curriculum = 'CSEC'
ORDER BY name;

-- View all CAPE subjects
SELECT id, name, curriculum, level, label, code
FROM subjects
WHERE curriculum = 'CAPE'
ORDER BY name;
