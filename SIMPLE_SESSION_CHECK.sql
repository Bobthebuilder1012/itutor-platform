-- SIMPLE QUERY: Just shows all future sessions
-- No replacements needed - just run it!

SELECT 
  -- Tutor info
  p.email as tutor_email,
  p.full_name as tutor_name,
  
  -- Session info
  s.id as session_id,
  s.provider,
  s.status,
  to_char(s.scheduled_start_at, 'YYYY-MM-DD HH24:MI') as session_time,
  
  -- Check what platform the join URL is for
  CASE 
    WHEN s.join_url LIKE '%zoom.us%' THEN '🎥 Zoom'
    WHEN s.join_url LIKE '%meet.google.com%' THEN '🟦 Google Meet'
    ELSE '❓ Other'
  END as actual_link_platform,
  
  -- When was this session last updated?
  to_char(s.updated_at, 'YYYY-MM-DD HH24:MI:SS') as last_updated
  
FROM sessions s
JOIN profiles p ON p.id = s.tutor_id
WHERE s.status IN ('SCHEDULED', 'JOIN_OPEN')
  AND s.scheduled_start_at >= NOW()
ORDER BY s.scheduled_start_at ASC;

-- Look for rows where:
-- provider column doesn't match actual_link_platform column
-- That means the session needs to be migrated!












