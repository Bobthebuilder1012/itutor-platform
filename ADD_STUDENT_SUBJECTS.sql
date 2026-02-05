-- =====================================================
-- ADD SUBJECTS TO STUDENT PROFILE
-- =====================================================
-- This will link subjects to a student so they show in "Your Subjects"

-- Step 1: Find your student user ID
-- Replace 'YOUR_EMAIL_HERE' with the student's email
SELECT id, email, role FROM profiles WHERE email = 'YOUR_EMAIL_HERE';

-- Step 2: Add subjects to the student
-- Replace 'YOUR_STUDENT_ID_HERE' with the ID from Step 1
-- This example adds Mathematics, English A, Physics, Chemistry, and Biology (CSEC)

INSERT INTO user_subjects (user_id, subject_id) VALUES
  -- Mathematics CSEC (Form 4-5)
  ('YOUR_STUDENT_ID_HERE', (SELECT id FROM subjects WHERE name = 'Mathematics' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1)),
  -- English A CSEC (Form 4-5)
  ('YOUR_STUDENT_ID_HERE', (SELECT id FROM subjects WHERE name = 'English A' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1)),
  -- Physics CSEC (Form 4-5)
  ('YOUR_STUDENT_ID_HERE', (SELECT id FROM subjects WHERE name = 'Physics' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1)),
  -- Chemistry CSEC (Form 4-5)
  ('YOUR_STUDENT_ID_HERE', (SELECT id FROM subjects WHERE name = 'Chemistry' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1)),
  -- Biology CSEC (Form 4-5)
  ('YOUR_STUDENT_ID_HERE', (SELECT id FROM subjects WHERE name = 'Biology' AND curriculum = 'CSEC' AND level = 'Form 4-5' LIMIT 1))
ON CONFLICT (user_id, subject_id) DO NOTHING;

-- Verify subjects were added
SELECT 
  us.id,
  s.name as subject_name,
  s.curriculum,
  s.level
FROM user_subjects us
JOIN subjects s ON us.subject_id = s.id
WHERE us.user_id = 'YOUR_STUDENT_ID_HERE';

SELECT 'Student subjects added successfully!' as message;
