-- Seed all 64 CXC syllabuses
-- Run this after TRUNCATE syllabuses CASCADE;

DO $$
DECLARE
  subject_id_var UUID;
  inserted_count INTEGER := 0;
BEGIN
  -- Clear existing
  TRUNCATE syllabuses CASCADE;
  RAISE NOTICE 'Cleared syllabuses table';

  -- CSEC Sciences
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Agricultural Science%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Agricultural Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Agricultural-Science-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Biology%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' AND name NOT LIKE '%Human%' AND name NOT LIKE '%Social%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Biology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Chemistry%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Chemistry-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Physics%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physics-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Integrated Science%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Integrated Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Integrated-Science-AmendedOct2025.pdf', 'Amended Oct 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Human and Social Biology%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Sciences', 'Human and Social Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Human-and-Social-Biology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Mathematics
  SELECT id INTO subject_id_var FROM subjects WHERE (name LIKE '%Mathematics%' OR name = 'Maths') AND curriculum = 'CSEC' AND name NOT LIKE '%Additional%' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Mathematics', 'Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Mathematics-AmendedOct2025.pdf', 'Amended Oct 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Additional Mathematics%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Mathematics', 'Additional Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Additional-Mathematics-Syllabus-Amended-2020.pdf', 'Amended 2020') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Languages
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%English%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Languages', 'English A & B', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-English-Syllabus-Revised-2025.pdf', 'Revised 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE (name LIKE '%Spanish%' OR name LIKE '%French%') AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Business
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Principles of Business%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Business', 'Principles of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Business-Syllabus-.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Principles of Accounts%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Business', 'Principles of Accounts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Accounts-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Economics%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Economics-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Office Administration%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Business', 'Office Administration', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Office-Administration-Syllabus-Revised-2024.pdf', 'Revised 2024') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Humanities
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Caribbean History%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Humanities', 'Caribbean History', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Caribbean-History-Syllabus-Amended.pdf', 'Amended') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Geography%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Humanities', 'Geography', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Geography-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Social Studies%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Humanities', 'Social Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Social-Studies-Syllabus-July-2023.pdf', 'Revised July 2023') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Religious Education%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Humanities', 'Religious Education', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Religious-Education-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Arts
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Visual Arts%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Arts', 'Visual Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Visual-Arts-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Music%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Arts', 'Music', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Music-Syllabus-Amended.pdf', 'Amended') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Theatre Arts%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Arts', 'Theatre Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Theatre-Arts-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Physical Education%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Arts', 'Physical Education and Sport', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physical-Education-and-Sport-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CSEC Technology
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Industrial Technology%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Technology', 'Industrial Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Industrial-Technology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Technical Drawing%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Technology', 'Technical Drawing', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Technical-Drawing-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Information Technology%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Technology', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Information-Technology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%EDPM%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CSEC', 'Technology', 'EDPM', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-EDPM-Syllabus-Revised-2024.pdf', 'Revised 2024') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Home Economics%' AND curriculum = 'CSEC' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CSEC', 'Home Economics', 'Home Economics', 'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC%20Home%20Ec.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Sciences
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Biology%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' AND name NOT LIKE '%Human%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Biology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Chemistry%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Chemistry-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Physics%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Physics-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Environmental Science%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Sciences', 'Environmental Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Environmental-Science-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Mathematics
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Pure%' AND name LIKE '%Mathematics%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Mathematics', 'Pure Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Pure-Mathematics-with-Specimen-Papers.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Applied%' AND name LIKE '%Mathematics%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Mathematics', 'Applied Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Applied-Mathematics-Syllabus-with-Specimen-Papers.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Technology  
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Computer Science%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, effective_year) VALUES (subject_id_var, 'CAPE', 'Technology', 'Computer Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Computer-Science-Syllabus-Eff.-2022.pdf', 2022) ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Information Technology%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, effective_year) VALUES (subject_id_var, 'CAPE', 'Technology', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Information-Technology-Syllabus-Eff.-2022.pdf', 2022) ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Business
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Accounting%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Business', 'Accounting', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Accounting-Syllabus-Revised.pdf', 'Revised') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Economics%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Economics-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Management of Business%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Business', 'Management of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Management-of-Business-Syllabus-Amended-2024.pdf', 'Amended 2024') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Entrepreneurship%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Business', 'Entrepreneurship', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Entrepreneurship-Syllabus-Amended.pdf', 'Amended') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Humanities
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Caribbean Studies%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Humanities', 'Caribbean Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Caribbean-Studies-Syllabus-Amended-October-2023.pdf', 'Amended Oct 2023') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Communication Studies%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Humanities', 'Communication Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Communication-Studies-Syllabus-Revised-2024.pdf', 'Revised 2024') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Sociology%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Humanities', 'Sociology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Sociology-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%History%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' AND name NOT LIKE '%Caribbean%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Humanities', 'History', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-History-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Law%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Humanities', 'Law', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Law-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Languages
  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Literatures%' AND name LIKE '%English%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Languages', 'Literatures in English', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Literatures-in-English-Syllabus-Revised.pdf', 'Revised') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%French%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Languages', 'French', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-French-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Spanish%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url) VALUES (subject_id_var, 'CAPE', 'Languages', 'Spanish', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Spanish-Syllabus.pdf') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  -- CAPE Arts
  SELECT id INTO subject_id_var FROM subjects WHERE (name LIKE '%Art%' OR name LIKE '%Design%') AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' AND name NOT LIKE '%Theatre%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Arts', 'Art and Design', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Art-and-Design-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  SELECT id INTO subject_id_var FROM subjects WHERE name LIKE '%Performing Arts%' AND curriculum = 'CAPE' AND name NOT LIKE '%Unit%' LIMIT 1;
  IF subject_id_var IS NOT NULL THEN
    INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version) VALUES (subject_id_var, 'CAPE', 'Arts', 'Performing Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Performing-Arts-Syllabus-with-Specimen-Papers-Amended.pdf', 'Amended') ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END IF;

  RAISE NOTICE '✅ Successfully inserted % syllabuses', inserted_count;
  RAISE NOTICE '✅ Curriculum feature is now ready!';
  RAISE NOTICE '✅ Navigate to /tutor/curriculum to view';
END $$;

-- Verify results
SELECT 
  qualification,
  category,
  COUNT(*) as syllabus_count
FROM syllabuses
GROUP BY qualification, category
ORDER BY qualification, category;





