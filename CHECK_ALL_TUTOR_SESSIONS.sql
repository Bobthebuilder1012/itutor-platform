-- This query shows ALL tutors and their future sessions
-- No need to replace anything - just run it and find your name/email

SELECT 
  p.email as tutor_email,
  p.full_name as tutor_name,
  p.id as tutor_id,
  s.id as session_id,
  s.provider,
  s.status,
  s.scheduled_start_at,
  s.meeting_created_at,
  s.updated_at,
  CASE 
    WHEN s.join_url LIKE '%zoom.us%' THEN '📹 Zoom'
    WHEN s.join_url LIKE '%meet.google.com%' THEN '🔵 Google Meet'
    ELSE '❓ Unknown'
  END as detected_platform
FROM profiles p
LEFT JOIN sessions s ON s.tutor_id = p.id
  AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
  AND s.scheduled_start_at >= NOW()
WHERE p.role = 'tutor'
ORDER BY p.email, s.scheduled_start_at ASC;

-- This will show:
-- - All tutors
-- - Their future sessions (if any)
-- - What platform each session is using
-- Find your email and check if the provider matches what you expect







