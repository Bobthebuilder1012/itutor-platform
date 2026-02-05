-- =====================================================
-- POPULATE CURRICULUM WITH CXC SYLLABUSES (FIXED)
-- =====================================================
-- This script properly includes the 'label' column

-- =====================================================
-- NOTE: Subjects already exist from seed data!
-- CSEC subjects use level: "Form 4-5"
-- CAPE subjects use level: "Unit 1" or "Unit 2" 
-- We just need to add syllabuses that reference existing subjects
-- =====================================================

-- Insert Syllabuses (CSEC - STEM)
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'Mathematics' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Mathematics Syllabus',
    'Effective for examinations from May/June 2024',
    2024,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Mathematics_Syllabus_2024.pdf',
    'Revised syllabus for 2024 examinations'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Physics' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Physics Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Physics_Syllabus_2015.pdf',
    'Current physics syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Chemistry' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Chemistry Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Chemistry_Syllabus_2015.pdf',
    'Current chemistry syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Biology' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Biology Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Biology_Syllabus_2015.pdf',
    'Current biology syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Integrated Science' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Integrated Science Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Integrated_Science_Syllabus_2015.pdf',
    'Current integrated science syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Information Technology' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'STEM',
    'Information Technology Syllabus',
    'Effective for examinations from May/June 2019',
    2019,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Information_Technology_Syllabus_2019.pdf',
    'Revised IT syllabus'
  );

-- CSEC Syllabuses (Languages)
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'English A' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Languages',
    'English A Syllabus',
    'Effective for examinations from May/June 2022',
    2022,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_English_A_Syllabus_2022.pdf',
    'Revised English A syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Spanish' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Languages',
    'Spanish Syllabus',
    'Effective for examinations from May/June 2017',
    2017,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Spanish_Syllabus_2017.pdf',
    'Current Spanish syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'French' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Languages',
    'French Syllabus',
    'Effective for examinations from May/June 2017',
    2017,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_French_Syllabus_2017.pdf',
    'Current French syllabus'
  );

-- CSEC Syllabuses (Business)
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'Economics' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Business',
    'Economics Syllabus',
    'Effective for examinations from May/June 2018',
    2018,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Economics_Syllabus_2018.pdf',
    'Current economics syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Principles of Accounts' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Business',
    'Principles of Accounts Syllabus',
    'Effective for examinations from May/June 2019',
    2019,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_POA_Syllabus_2019.pdf',
    'Revised POA syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Principles of Business' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Business',
    'Principles of Business Syllabus',
    'Effective for examinations from May/June 2018',
    2018,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_POB_Syllabus_2018.pdf',
    'Current POB syllabus'
  );

-- CSEC Syllabuses (Humanities)
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'Social Studies' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Humanities',
    'Social Studies Syllabus',
    'Effective for examinations from May/June 2017',
    2017,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Social_Studies_Syllabus_2017.pdf',
    'Current social studies syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'History' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Humanities',
    'History Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_History_Syllabus_2015.pdf',
    'Current history syllabus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Geography' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1),
    'CSEC',
    'Humanities',
    'Geography Syllabus',
    'Effective for examinations from May/June 2018',
    2018,
    'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC_Geography_Syllabus_2018.pdf',
    'Revised geography syllabus'
  );

-- CAPE Syllabuses (STEM)
-- Note: CAPE subjects in the seed data have names like "Pure Mathematics Unit 1" not "Pure Mathematics"
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'Pure Mathematics Unit 1' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Pure Mathematics Unit 1 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Pure_Mathematics_U1_Syllabus_2013.pdf',
    'Unit 1: Algebra, Geometry and Calculus'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Pure Mathematics Unit 2' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Pure Mathematics Unit 2 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Pure_Mathematics_U2_Syllabus_2013.pdf',
    'Unit 2: Complex Numbers, Analysis and Matrices'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Physics Unit 1' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Physics Unit 1 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Physics_U1_Syllabus_2013.pdf',
    'Unit 1: Mechanics, Waves and Thermal Physics'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Physics Unit 2' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Physics Unit 2 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Physics_U2_Syllabus_2013.pdf',
    'Unit 2: Electricity, Magnetism and Modern Physics'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Chemistry Unit 1' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Chemistry Unit 1 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Chemistry_U1_Syllabus_2013.pdf',
    'Unit 1: Fundamentals in Chemistry'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Chemistry Unit 2' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Chemistry Unit 2 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Chemistry_U2_Syllabus_2013.pdf',
    'Unit 2: Analytical and Organic Chemistry'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Biology Unit 1' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Biology Unit 1 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Biology_U1_Syllabus_2013.pdf',
    'Unit 1: Cells, Living Organisms and the Environment'
  ),
  (
    (SELECT id FROM subjects WHERE name = 'Biology Unit 2' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'STEM',
    'Biology Unit 2 Syllabus',
    'Effective for examinations from May/June 2013',
    2013,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Biology_U2_Syllabus_2013.pdf',
    'Unit 2: Genetics, Variation and Natural Selection'
  );

-- CAPE Syllabuses (Compulsory)
INSERT INTO syllabuses (subject_id, qualification, category, title, version, effective_year, pdf_url, notes) VALUES
  (
    (SELECT id FROM subjects WHERE name = 'Communication Studies Unit 1' AND curriculum = 'CAPE' LIMIT 1),
    'CAPE',
    'Compulsory',
    'Communication Studies Syllabus',
    'Effective for examinations from May/June 2015',
    2015,
    'https://www.cxc.org/SiteAssets/syllabusses/CAPE/CAPE_Communication_Studies_Syllabus_2015.pdf',
    'Compulsory for all CAPE students'
  );

-- Success message and verification
SELECT 'Curriculum populated successfully!' as message;
SELECT COUNT(*) as total_subjects FROM subjects;
SELECT COUNT(*) as total_syllabuses FROM syllabuses;

-- View syllabuses by category
SELECT 
  qualification,
  category,
  COUNT(*) as syllabus_count
FROM syllabuses
GROUP BY qualification, category
ORDER BY qualification, category;
