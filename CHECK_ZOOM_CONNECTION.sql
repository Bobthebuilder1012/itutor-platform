-- Check if Zoom is properly connected for the tutor

SELECT 
  tutor_id,
  provider,
  connection_status,
  provider_account_email,
  provider_account_name,
  token_expires_at,
  CASE 
    WHEN token_expires_at < NOW() THEN '❌ EXPIRED'
    WHEN token_expires_at > NOW() THEN '✅ Valid'
    ELSE '❓ Unknown'
  END as token_status,
  created_at,
  updated_at
FROM tutor_video_provider_connections
WHERE provider = 'zoom'
ORDER BY updated_at DESC;

-- If token_status shows EXPIRED, you need to reconnect Zoom






