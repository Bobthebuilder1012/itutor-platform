-- Check what sessions exist and which tutor they belong to
SELECT 
  s.id,
  s.tutor_id,
  s.student_id,
  s.status,
  s.scheduled_start_at,
  s.provider,
  s.join_url IS NOT NULL as has_join_url,
  p.display_name as tutor_name
FROM sessions s
LEFT JOIN profiles p ON s.tutor_id = p.id
ORDER BY s.created_at DESC
LIMIT 10;

-- Also check if any tutors are in the profiles table
SELECT 
  id,
  display_name,
  role,
  email
FROM profiles
WHERE role = 'tutor'
LIMIT 5;






