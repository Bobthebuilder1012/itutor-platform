-- Check video provider connection status for all tutors
SELECT 
  p.id,
  p.full_name,
  p.username,
  p.display_name,
  v.provider,
  v.connection_status,
  v.connected_at,
  v.last_sync
FROM profiles p
LEFT JOIN tutor_video_provider_connections v ON p.id = v.tutor_id
WHERE p.role = 'tutor'
ORDER BY v.connection_status DESC NULLS LAST, p.full_name ASC
LIMIT 20;

-- Summary count
SELECT 
  connection_status,
  COUNT(*) as tutor_count
FROM tutor_video_provider_connections
GROUP BY connection_status;

-- Tutors without any video provider connection
SELECT COUNT(*) as tutors_without_provider
FROM profiles p
WHERE p.role = 'tutor'
  AND NOT EXISTS (
    SELECT 1 
    FROM tutor_video_provider_connections v 
    WHERE v.tutor_id = p.id 
      AND v.connection_status = 'connected'
  );
