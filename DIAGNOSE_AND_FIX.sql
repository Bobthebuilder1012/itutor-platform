-- =====================================================
-- STEP 1: DIAGNOSE THE ISSUE
-- =====================================================
-- Run this section first to see what's in your database

-- Check existing subjects and their levels
SELECT 
  'Existing CSEC Levels' as info,
  level,
  COUNT(*) as count
FROM subjects
WHERE curriculum = 'CSEC'
GROUP BY level
ORDER BY level;

SELECT 
  'Existing CAPE Levels' as info,
  level,
  COUNT(*) as count
FROM subjects
WHERE curriculum = 'CAPE'
GROUP BY level
ORDER BY level;

-- Check if there's a check constraint on level
SELECT
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'subjects'
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%level%';

-- =====================================================
-- STEP 2: IF CONSTRAINT EXISTS, DROP IT
-- =====================================================
-- Only run this if the above query shows a level constraint

-- ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_level_check;

-- =====================================================
-- STEP 3: ADD SYLLABUSES USING EXISTING SUBJECTS ONLY
-- =====================================================
-- This will work with whatever subjects already exist in your database

-- CSEC Syllabuses
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Mathematics Syllabus',
  'Effective for examinations from May/June 2024',
  2024,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Mathematics_Syllabus_2024.pdf',
  'Revised syllabus for 2024 examinations'
FROM subjects s
WHERE s.name = 'Mathematics' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Physics Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Physics_Syllabus_2015.pdf',
  'Current physics syllabus'
FROM subjects s
WHERE s.name = 'Physics' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Chemistry Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Chemistry_Syllabus_2015.pdf',
  'Current chemistry syllabus'
FROM subjects s
WHERE s.name = 'Chemistry' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Biology Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Biology_Syllabus_2015.pdf',
  'Current biology syllabus'
FROM subjects s
WHERE s.name = 'Biology' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Integrated Science Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Integrated_Science_Syllabus_2015.pdf',
  'Current integrated science syllabus'
FROM subjects s
WHERE s.name = 'Integrated Science' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'STEM',
  'Information Technology Syllabus',
  'Effective for examinations from May/June 2019',
  2019,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Information_Technology_Syllabus_2019.pdf',
  'Revised IT syllabus'
FROM subjects s
WHERE s.name = 'Information Technology' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Languages',
  'English A Syllabus',
  'Effective for examinations from May/June 2022',
  2022,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_English_A_Syllabus_2022.pdf',
  'Revised English A syllabus'
FROM subjects s
WHERE s.name = 'English A' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Languages',
  'Spanish Syllabus',
  'Effective for examinations from May/June 2017',
  2017,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Spanish_Syllabus_2017.pdf',
  'Current Spanish syllabus'
FROM subjects s
WHERE s.name = 'Spanish' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Languages',
  'French Syllabus',
  'Effective for examinations from May/June 2017',
  2017,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_French_Syllabus_2017.pdf',
  'Current French syllabus'
FROM subjects s
WHERE s.name = 'French' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Business',
  'Economics Syllabus',
  'Effective for examinations from May/June 2018',
  2018,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Economics_Syllabus_2018.pdf',
  'Current economics syllabus'
FROM subjects s
WHERE s.name = 'Economics' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Business',
  'Principles of Accounts Syllabus',
  'Effective for examinations from May/June 2019',
  2019,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_POA_Syllabus_2019.pdf',
  'Revised POA syllabus'
FROM subjects s
WHERE s.name = 'Principles of Accounts' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Business',
  'Principles of Business Syllabus',
  'Effective for examinations from May/June 2018',
  2018,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_POB_Syllabus_2018.pdf',
  'Current POB syllabus'
FROM subjects s
WHERE s.name = 'Principles of Business' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Humanities',
  'Social Studies Syllabus',
  'Effective for examinations from May/June 2017',
  2017,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Social_Studies_Syllabus_2017.pdf',
  'Current social studies syllabus'
FROM subjects s
WHERE s.name = 'Social Studies' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Humanities',
  'History Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_History_Syllabus_2015.pdf',
  'Current history syllabus'
FROM subjects s
WHERE s.name = 'History' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CSEC',
  'Humanities',
  'Geography Syllabus',
  'Effective for examinations from May/June 2018',
  2018,
  'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Geography_Syllabus_2018.pdf',
  'Revised geography syllabus'
FROM subjects s
WHERE s.name = 'Geography' AND s.curriculum = 'CSEC'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

-- CAPE Syllabuses
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Pure Mathematics Unit 1 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Pure_Mathematics_U1_Syllabus_2013.pdf',
  'Unit 1: Algebra, Geometry and Calculus'
FROM subjects s
WHERE s.name LIKE '%Pure Mathematics%Unit 1%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Pure Mathematics Unit 2 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Pure_Mathematics_U2_Syllabus_2013.pdf',
  'Unit 2: Complex Numbers, Analysis and Matrices'
FROM subjects s
WHERE s.name LIKE '%Pure Mathematics%Unit 2%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Physics Unit 1 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Physics_U1_Syllabus_2013.pdf',
  'Unit 1: Mechanics, Waves and Thermal Physics'
FROM subjects s
WHERE s.name LIKE '%Physics%Unit 1%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Physics Unit 2 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Physics_U2_Syllabus_2013.pdf',
  'Unit 2: Electricity, Magnetism and Modern Physics'
FROM subjects s
WHERE s.name LIKE '%Physics%Unit 2%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Chemistry Unit 1 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Chemistry_U1_Syllabus_2013.pdf',
  'Unit 1: Fundamentals in Chemistry'
FROM subjects s
WHERE s.name LIKE '%Chemistry%Unit 1%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Chemistry Unit 2 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Chemistry_U2_Syllabus_2013.pdf',
  'Unit 2: Analytical and Organic Chemistry'
FROM subjects s
WHERE s.name LIKE '%Chemistry%Unit 2%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Biology Unit 1 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Biology_U1_Syllabus_2013.pdf',
  'Unit 1: Cells, Living Organisms and the Environment'
FROM subjects s
WHERE s.name LIKE '%Biology%Unit 1%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'STEM',
  'Biology Unit 2 Syllabus',
  'Effective for examinations from May/June 2013',
  2013,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Biology_U2_Syllabus_2013.pdf',
  'Unit 2: Genetics, Variation and Natural Selection'
FROM subjects s
WHERE s.name LIKE '%Biology%Unit 2%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes)
SELECT 
  s.id,
  'CAPE',
  'Compulsory',
  'Communication Studies Syllabus',
  'Effective for examinations from May/June 2015',
  2015,
  'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Communication_Studies_Syllabus_2015.pdf',
  'Compulsory for all CAPE students'
FROM subjects s
WHERE s.name LIKE '%Communication Studies%' AND s.curriculum = 'CAPE'
AND NOT EXISTS (SELECT 1 FROM syllabuses WHERE subject_id = s.id);

-- Verification
SELECT 'Syllabuses added successfully!' as message;
SELECT COUNT(*) as total_syllabuses FROM syllabuses;
SELECT qualification, category, COUNT(*) as count
FROM syllabuses
GROUP BY qualification, category
ORDER BY qualification, category;
