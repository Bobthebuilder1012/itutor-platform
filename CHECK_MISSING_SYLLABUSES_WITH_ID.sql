-- =====================================================
-- DIAGNOSE MISSING SYLLABUSES (WITH TUTOR ID)
-- REPLACE 'YOUR_TUTOR_ID_HERE' with your actual ID from FIND_YOUR_TUTOR_ID.sql
-- =====================================================

-- 1. What subjects does this tutor teach?
SELECT 
  s.name as subject_name,
  s.curriculum,
  s.level,
  ts.subject_id
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
WHERE ts.tutor_id = 'YOUR_TUTOR_ID_HERE'
ORDER BY s.name;

-- 2. Which of those subjects have syllabuses?
SELECT 
  s.name as subject_name,
  s.curriculum,
  sy.title as syllabus_title,
  sy.id as syllabus_id,
  CASE 
    WHEN sy.id IS NULL THEN '❌ MISSING'
    ELSE '✅ EXISTS'
  END as status
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
LEFT JOIN syllabuses sy ON sy.subject_id = s.id
WHERE ts.tutor_id = 'YOUR_TUTOR_ID_HERE'
ORDER BY status DESC, s.name;

-- 3. Count summary
SELECT 
  COUNT(DISTINCT ts.subject_id) as total_subjects,
  COUNT(DISTINCT sy.id) as subjects_with_syllabuses,
  COUNT(DISTINCT ts.subject_id) - COUNT(DISTINCT sy.id) as missing_syllabuses
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
LEFT JOIN syllabuses sy ON sy.subject_id = s.id
WHERE ts.tutor_id = 'YOUR_TUTOR_ID_HERE';

-- 4. Show which subjects are missing and why
SELECT 
  s.name as missing_subject,
  s.curriculum,
  s.level,
  s.id as subject_id
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
LEFT JOIN syllabuses sy ON sy.subject_id = s.id
WHERE ts.tutor_id = 'YOUR_TUTOR_ID_HERE'
  AND sy.id IS NULL
ORDER BY s.curriculum, s.name;












