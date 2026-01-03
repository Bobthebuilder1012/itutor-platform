-- Check sessions for a specific tutor to see if migration worked
-- Replace 'YOUR_TUTOR_ID' with the actual tutor ID

SELECT 
  id,
  tutor_id,
  student_id,
  provider,
  join_url,
  scheduled_start_at,
  status,
  meeting_created_at,
  updated_at
FROM sessions
WHERE tutor_id = 'YOUR_TUTOR_ID'
  AND status IN ('SCHEDULED', 'JOIN_OPEN')
  AND scheduled_start_at >= NOW()
ORDER BY scheduled_start_at ASC;

-- To find your tutor ID, run:
-- SELECT id, email, full_name FROM profiles WHERE role = 'tutor';







