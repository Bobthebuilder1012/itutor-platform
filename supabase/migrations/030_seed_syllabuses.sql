-- =====================================================
-- SYLLABUS SEED MIGRATION
-- Populates syllabuses table with official CXC syllabuses
-- Uses direct subject table joins for reliability
-- =====================================================

-- Clear existing data
TRUNCATE TABLE syllabuses CASCADE;

-- =============================================================================
-- CSEC SYLLABUSES
-- =============================================================================

-- CSEC Sciences
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Agricultural Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Agricultural-Science-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Agricultural Science%' AND s.curriculum = 'CSEC' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Biology' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Chemistry-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Chemistry' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Physics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Integrated Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Integrated-Science-AmendedOct2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Integrated Science' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Human and Social Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Human-and-Social-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Human%Social%Biology%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Mathematics
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Mathematics', 'Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Mathematics-AmendedOct2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Mathematics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Mathematics', 'Additional Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Additional-Mathematics-Syllabus-Amended-2020.pdf', 'Amended 2020', 2020
FROM subjects s WHERE s.name = 'Additional Mathematics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Languages
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'English A & B', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-English-Syllabus-Revised-2025.pdf', 'Revised 2025', 2025
FROM subjects s WHERE s.name = 'English A' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'English A & B', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-English-Syllabus-Revised-2025.pdf', 'Revised 2025', 2025
FROM subjects s WHERE s.name = 'English B' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Spanish' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'French' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Portuguese' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Business
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Principles of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Business-Syllabus-.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Principles%Business%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Principles of Accounts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Accounts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Principles%Accounts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Economics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Economics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Office Administration', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Office-Administration-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%Office%Administration%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Social Studies
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Caribbean History', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Caribbean-History-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name LIKE '%Caribbean%History%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Geography', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Geography-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Geography' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Social Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Social-Studies-Syllabus-July-2023.pdf', 'Revised July 2023', 2023
FROM subjects s WHERE s.name = 'Social Studies' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Religious Education', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Religious-Education-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Religious%Education%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Arts
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Visual Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Visual-Arts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Visual%Arts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Music', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Music-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name = 'Music' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Theatre Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Theatre-Arts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Theatre%Arts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Physical Education and Sport', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physical-Education-and-Sport-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Physical%Education%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Technical
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Industrial Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Industrial-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Industrial%Technology%' AND s.curriculum = 'CSEC' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Technical Drawing', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Technical-Drawing-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Technical%Drawing%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Information-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Information Technology' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'EDPM', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-EDPM-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%EDPM%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Other
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Other', 'Home Economics', 'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC%20Home%20Ec.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Food%Nutrition%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- =============================================================================
-- CAPE SYLLABUSES
-- =============================================================================

-- CAPE Sciences
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Biology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Chemistry-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Chemistry' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Physics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Physics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Environmental Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Environmental-Science-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name LIKE '%Environmental%Science%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Agricultural Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Agricultural-Science-Syllabus-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Agricultural%Science%' AND s.curriculum = 'CAPE' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Mathematics
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Pure Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Pure-Mathematics-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Pure Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Applied Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Applied-Mathematics-Syllabus-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Applied Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Integrated Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Integrated-Mathematics-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name = 'Integrated Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Technical
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Computer Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Computer-Science-Syllabus-Eff.-2022.pdf', 'Effective 2022', 2022
FROM subjects s WHERE s.name = 'Computer Science' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Information-Technology-Syllabus-Eff.-2022.pdf', 'Effective 2022', 2022
FROM subjects s WHERE s.name = 'Information Technology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Digital Media', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Digital-Media-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Digital%Media%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Animation and Game Design', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Animation-and-Game-Design-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Animation%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Green Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Green-Engineering-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Green%Engineering%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Electrical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Electrical-and-Electronic-Engineering-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Electrical%' AND s.curriculum = 'CAPE' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Building and Mechanical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Building-and-Mechanical-Engineering-Syllabus-With-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Building%Mechanical%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Mechanical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Building-and-Mechanical-Engineering-Syllabus-With-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Mechanical Engineering' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Business
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Accounting', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Accounting-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name = 'Accounting' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Economics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Economics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Management of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Management-of-Business-Syllabus-Amended-2024.pdf', 'Amended 2024', 2024
FROM subjects s WHERE s.name LIKE '%Management%Business%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Entrepreneurship', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Entrepreneurship-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name = 'Entrepreneurship' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Logistics and Supply Chain Operations', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Logistics-and-Supply-Chain-Operations-Syllabus-and-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Logistics%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Financial Services Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Financial-Services-Studies-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Financial%Services%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Tourism', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Tourism-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Tourism' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Social Studies
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Caribbean Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Caribbean-Studies-Syllabus-Amended-October-2023.pdf', 'Amended Oct 2023', 2023
FROM subjects s WHERE s.name LIKE '%Caribbean%Studies%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Communication Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Communication-Studies-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%Communication%Studies%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Sociology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Sociology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Sociology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'History', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-History-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'History' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Law', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Law-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Law' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Geography', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Geography-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Geography' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Criminology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Criminology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Criminology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Languages
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'Literatures in English', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Literatures-in-English-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Literatures%English%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'French', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-French-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'French' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'Spanish', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Spanish-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Spanish' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Arts
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Art and Design', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Art-and-Design-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name LIKE '%Art%Design%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Performing Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Performing-Arts-Syllabus-with-Specimen-Papers-Amended.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Performing%Arts%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Music', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Music-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Music' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Other
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Food and Nutrition', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Food-and-Nutrition-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Food%Nutrition%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Physical Education and Sport', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Physical-Education-and-Sport-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name LIKE '%Physical%Education%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Sports Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Sports-Science-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Sports%Science%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Digital Literacy', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Digital-Literacy-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Digital%Literacy%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Maritime Operations', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Maritime-Operations-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Maritime%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM syllabuses;
  RAISE NOTICE '✅ Syllabuses seeded successfully';
  RAISE NOTICE '✅ Total syllabuses in database: %', v_count;
  RAISE NOTICE '✅ Curriculum feature ready for use';
END $$;
