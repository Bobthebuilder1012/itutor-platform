-- =====================================================
-- COMPLETE CURRICULUM POPULATION SCRIPT
-- =====================================================
-- This script will:
-- 1. Create subjects if they don't exist
-- 2. Add syllabuses for those subjects

-- =====================================================
-- PART 1: ENSURE SUBJECTS EXIST
-- =====================================================

-- CSEC Subjects (Form 4-5 level with proper labels)
DO $$
BEGIN
  -- Mathematics
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Mathematics' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Mathematics', 'CSEC', 'Form 4-5', 'CSEC Mathematics', 'MATH', NOW());
  END IF;

  -- English A
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'English A' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('English A', 'CSEC', 'Form 4-5', 'CSEC English A', 'ENGA', NOW());
  END IF;

  -- Physics
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Physics' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Physics', 'CSEC', 'Form 4-5', 'CSEC Physics', 'PHYS', NOW());
  END IF;

  -- Chemistry
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Chemistry' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Chemistry', 'CSEC', 'Form 4-5', 'CSEC Chemistry', 'CHEM', NOW());
  END IF;

  -- Biology
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Biology' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Biology', 'CSEC', 'Form 4-5', 'CSEC Biology', 'BIOL', NOW());
  END IF;

  -- Integrated Science
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Integrated Science' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Integrated Science', 'CSEC', 'Form 4-5', 'CSEC Integrated Science', 'ISCI', NOW());
  END IF;

  -- Information Technology
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Information Technology' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Information Technology', 'CSEC', 'Form 4-5', 'CSEC Information Technology', 'IT', NOW());
  END IF;

  -- Economics
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Economics' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Economics', 'CSEC', 'Form 4-5', 'CSEC Economics', 'ECON', NOW());
  END IF;

  -- Principles of Accounts
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Principles of Accounts' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Principles of Accounts', 'CSEC', 'Form 4-5', 'CSEC Principles of Accounts', 'POA', NOW());
  END IF;

  -- Principles of Business
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Principles of Business' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Principles of Business', 'CSEC', 'Form 4-5', 'CSEC Principles of Business', 'POB', NOW());
  END IF;

  -- Spanish
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Spanish' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Spanish', 'CSEC', 'Form 4-5', 'CSEC Spanish', 'SPAN', NOW());
  END IF;

  -- French
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'French' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('French', 'CSEC', 'Form 4-5', 'CSEC French', 'FREN', NOW());
  END IF;

  -- Social Studies
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Social Studies' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Social Studies', 'CSEC', 'Form 4-5', 'CSEC Social Studies', 'SOCSTD', NOW());
  END IF;

  -- History
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'History' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('History', 'CSEC', 'Form 4-5', 'CSEC History', 'HIST', NOW());
  END IF;

  -- Geography
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Geography' AND curriculum = 'CSEC' AND level = 'Form 4-5') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Geography', 'CSEC', 'Form 4-5', 'CSEC Geography', 'GEOG', NOW());
  END IF;
END $$;

-- CAPE Subjects (Unit 1 and Unit 2)
DO $$
BEGIN
  -- Pure Mathematics Unit 1
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Pure Mathematics Unit 1' AND curriculum = 'CAPE' AND level = 'Unit 1') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Pure Mathematics Unit 1', 'CAPE', 'Unit 1', 'CAPE Pure Mathematics Unit 1', 'PMATH1', NOW());
  END IF;

  -- Pure Mathematics Unit 2
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Pure Mathematics Unit 2' AND curriculum = 'CAPE' AND level = 'Unit 2') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Pure Mathematics Unit 2', 'CAPE', 'Unit 2', 'CAPE Pure Mathematics Unit 2', 'PMATH2', NOW());
  END IF;

  -- Physics Unit 1
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Physics Unit 1' AND curriculum = 'CAPE' AND level = 'Unit 1') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Physics Unit 1', 'CAPE', 'Unit 1', 'CAPE Physics Unit 1', 'PHYS1', NOW());
  END IF;

  -- Physics Unit 2
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Physics Unit 2' AND curriculum = 'CAPE' AND level = 'Unit 2') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Physics Unit 2', 'CAPE', 'Unit 2', 'CAPE Physics Unit 2', 'PHYS2', NOW());
  END IF;

  -- Chemistry Unit 1
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Chemistry Unit 1' AND curriculum = 'CAPE' AND level = 'Unit 1') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Chemistry Unit 1', 'CAPE', 'Unit 1', 'CAPE Chemistry Unit 1', 'CHEM1', NOW());
  END IF;

  -- Chemistry Unit 2
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Chemistry Unit 2' AND curriculum = 'CAPE' AND level = 'Unit 2') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Chemistry Unit 2', 'CAPE', 'Unit 2', 'CAPE Chemistry Unit 2', 'CHEM2', NOW());
  END IF;

  -- Biology Unit 1
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Biology Unit 1' AND curriculum = 'CAPE' AND level = 'Unit 1') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Biology Unit 1', 'CAPE', 'Unit 1', 'CAPE Biology Unit 1', 'BIOL1', NOW());
  END IF;

  -- Biology Unit 2
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Biology Unit 2' AND curriculum = 'CAPE' AND level = 'Unit 2') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Biology Unit 2', 'CAPE', 'Unit 2', 'CAPE Biology Unit 2', 'BIOL2', NOW());
  END IF;

  -- Communication Studies Unit 1
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'Communication Studies Unit 1' AND curriculum = 'CAPE' AND level = 'Unit 1') THEN
    INSERT INTO subjects (name, curriculum, level, label, code, created_at)
    VALUES ('Communication Studies Unit 1', 'CAPE', 'Unit 1', 'CAPE Communication Studies', 'COMM1', NOW());
  END IF;
END $$;

-- =====================================================
-- PART 2: ADD SYLLABUSES
-- =====================================================

-- CSEC Syllabuses (STEM)
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
WHERE s.name = 'Mathematics' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Mathematics Syllabus'
);

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
WHERE s.name = 'Physics' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Physics Syllabus'
);

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
WHERE s.name = 'Chemistry' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Chemistry Syllabus'
);

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
WHERE s.name = 'Biology' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Biology Syllabus'
);

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
WHERE s.name = 'Integrated Science' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Integrated Science Syllabus'
);

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
WHERE s.name = 'Information Technology' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Information Technology Syllabus'
);

-- CSEC Syllabuses (Languages)
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
WHERE s.name = 'English A' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'English A Syllabus'
);

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
WHERE s.name = 'Spanish' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Spanish Syllabus'
);

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
WHERE s.name = 'French' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'French Syllabus'
);

-- CSEC Syllabuses (Business)
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
WHERE s.name = 'Economics' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Economics Syllabus'
);

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
WHERE s.name = 'Principles of Accounts' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Principles of Accounts Syllabus'
);

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
WHERE s.name = 'Principles of Business' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Principles of Business Syllabus'
);

-- CSEC Syllabuses (Humanities)
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
WHERE s.name = 'Social Studies' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Social Studies Syllabus'
);

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
WHERE s.name = 'History' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'History Syllabus'
);

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
WHERE s.name = 'Geography' AND s.curriculum = 'CSEC' AND s.level = 'Form 4-5'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Geography Syllabus'
);

-- CAPE Syllabuses (STEM)
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
WHERE s.name = 'Pure Mathematics Unit 1' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Pure Mathematics Unit 1 Syllabus'
);

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
WHERE s.name = 'Pure Mathematics Unit 2' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Pure Mathematics Unit 2 Syllabus'
);

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
WHERE s.name = 'Physics Unit 1' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Physics Unit 1 Syllabus'
);

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
WHERE s.name = 'Physics Unit 2' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Physics Unit 2 Syllabus'
);

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
WHERE s.name = 'Chemistry Unit 1' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Chemistry Unit 1 Syllabus'
);

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
WHERE s.name = 'Chemistry Unit 2' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Chemistry Unit 2 Syllabus'
);

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
WHERE s.name = 'Biology Unit 1' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Biology Unit 1 Syllabus'
);

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
WHERE s.name = 'Biology Unit 2' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Biology Unit 2 Syllabus'
);

-- CAPE Syllabuses (Compulsory)
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
WHERE s.name = 'Communication Studies Unit 1' AND s.curriculum = 'CAPE'
AND NOT EXISTS (
  SELECT 1 FROM syllabuses WHERE subject_id = s.id AND title = 'Communication Studies Syllabus'
);

-- =====================================================
-- VERIFICATION & RESULTS
-- =====================================================
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
