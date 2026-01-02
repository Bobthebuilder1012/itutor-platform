-- =====================================================
-- ADD MISSING SYLLABUSES
-- Adds syllabuses for subjects that tutors teach but don't have PDFs yet
-- =====================================================

-- CAPE Accounting
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Accounting', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Accounting-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name = 'Accounting' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Accounting Unit 2 (same PDF as main Accounting)
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Accounting Unit 2', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Accounting-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Accounting%Unit%2%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Applied Mathematics
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Applied Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Applied-Mathematics-Syllabus-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Applied Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Auto Mechanics (if this is an official CXC subject)
-- Note: "Auto Mechanics" is not a standard CSEC subject - might be "Automotive Engineering" or similar
-- Trying to match any automotive-related subject
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Auto Mechanics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Technical-Vocational-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Auto%Mechanic%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- Verify what was inserted
SELECT 
  'Added!' as status,
  COUNT(*) as new_syllabuses
FROM syllabuses
WHERE title IN ('Accounting Unit 2', 'Applied Mathematics', 'Auto Mechanics')
   OR (title = 'Accounting' AND qualification = 'CAPE');

-- Show all syllabuses now
SELECT COUNT(*) as total_syllabuses FROM syllabuses;




