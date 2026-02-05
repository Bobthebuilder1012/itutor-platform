-- =====================================================
-- ADD DEFAULT SUBJECTS TO ALL STUDENTS
-- =====================================================
-- This script assigns core CSEC subjects to all existing students
-- so they can see syllabuses in their "Your Subjects" section

-- Add Mathematics to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'Mathematics' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Add English A to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'English A' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Add Physics to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'Physics' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Add Chemistry to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'Chemistry' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Add Biology to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'Biology' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Add Integrated Science to all students
INSERT INTO user_subjects (user_id, subject_id)
SELECT 
  p.id as user_id,
  s.id as subject_id
FROM profiles p
CROSS JOIN subjects s
WHERE p.role = 'student'
  AND s.name = 'Integrated Science' 
  AND s.curriculum = 'CSEC' 
  AND s.level = 'Form 4-5'
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Verification
SELECT 
  'Subjects assigned to all students!' as message,
  COUNT(DISTINCT user_id) as students_with_subjects,
  COUNT(*) as total_subject_assignments
FROM user_subjects us
JOIN profiles p ON us.user_id = p.id
WHERE p.role = 'student';

-- Show breakdown by student
SELECT 
  p.email,
  p.full_name,
  COUNT(us.subject_id) as subject_count
FROM profiles p
LEFT JOIN user_subjects us ON p.id = us.user_id
WHERE p.role = 'student'
GROUP BY p.id, p.email, p.full_name
ORDER BY p.email;
