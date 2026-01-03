-- This query will show YOUR sessions automatically
-- It finds the tutor by email, so replace 'your-email@example.com' with your actual email

-- First, find your tutor ID and verify it's correct:
SELECT 
  id as tutor_id,
  email,
  full_name,
  role
FROM profiles
WHERE role = 'tutor'
  AND email = 'your-email@example.com';  -- REPLACE THIS with your email

-- Then check your sessions:
WITH my_tutor AS (
  SELECT id
  FROM profiles
  WHERE role = 'tutor'
    AND email = 'your-email@example.com'  -- REPLACE THIS with your email
  LIMIT 1
)
SELECT 
  s.id,
  s.provider,
  s.join_url,
  s.scheduled_start_at,
  s.status,
  s.meeting_created_at,
  s.updated_at,
  -- Show if this is a future session
  CASE 
    WHEN s.scheduled_start_at >= NOW() THEN '🔮 FUTURE'
    ELSE '⏰ PAST'
  END as timeline
FROM sessions s
CROSS JOIN my_tutor mt
WHERE s.tutor_id = mt.id
  AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
ORDER BY s.scheduled_start_at ASC;






