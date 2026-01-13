-- =====================================================
-- FIND YOUR TUTOR ID
-- Run this first to get your tutor account ID
-- =====================================================

-- Find tutors with Chemistry (you teach Chemistry based on the screenshot)
SELECT 
  p.id as tutor_id,
  p.full_name,
  p.email,
  p.username,
  COUNT(ts.subject_id) as num_subjects
FROM profiles p
JOIN tutor_subjects ts ON ts.tutor_id = p.id
JOIN subjects s ON s.id = ts.subject_id
WHERE p.role = 'tutor'
  AND s.name = 'Chemistry'
GROUP BY p.id, p.full_name, p.email, p.username
ORDER BY p.created_at DESC
LIMIT 5;













