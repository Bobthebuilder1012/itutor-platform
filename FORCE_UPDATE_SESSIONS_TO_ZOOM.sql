-- ⚠️ EMERGENCY FIX: Force update sessions to Zoom
-- Use this ONLY if the automatic migration button isn't working

-- STEP 1: First, verify which sessions need updating
SELECT 
  p.email as tutor_email,
  s.id as session_id,
  s.provider as current_provider,
  s.join_url as current_url,
  to_char(s.scheduled_start_at, 'YYYY-MM-DD HH24:MI') as session_time,
  CASE 
    WHEN s.join_url LIKE '%zoom.us%' THEN 'Zoom'
    WHEN s.join_url LIKE '%meet.google.com%' THEN 'Google Meet'
    ELSE 'Unknown'
  END as url_platform
FROM sessions s
JOIN profiles p ON p.id = s.tutor_id
WHERE p.role = 'tutor'
  AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
  AND s.scheduled_start_at >= NOW()
ORDER BY s.scheduled_start_at;

-- LOOK AT THE RESULTS ABOVE
-- If current_provider says 'zoom' but url_platform says 'Google Meet', 
-- then the session needs a new Zoom link created

-- ⚠️⚠️⚠️ WARNING ⚠️⚠️⚠️
-- The query below will ONLY update the provider field
-- You will still need to create actual Zoom meeting links
-- This is why the "Refresh Future Session Links" button is better!

/*
-- STEP 2: ONLY run this if you understand the implications
-- This updates the provider field but does NOT create new Zoom meetings
-- You'll need to manually create Zoom links and update join_url

UPDATE sessions
SET 
  provider = 'zoom',
  updated_at = NOW()
WHERE id IN (
  SELECT s.id
  FROM sessions s
  JOIN profiles p ON p.id = s.tutor_id
  WHERE p.email = 'your-tutor-email@example.com'  -- REPLACE WITH YOUR EMAIL
    AND s.status IN ('SCHEDULED', 'JOIN_OPEN')
    AND s.scheduled_start_at >= NOW()
);

-- After running the above, you'd need to manually:
-- 1. Create Zoom meetings for each session
-- 2. Update the join_url field with the Zoom links
-- 3. Update meeting_external_id with the Zoom meeting IDs
*/

-- 🚀 BETTER SOLUTION:
-- Instead of running SQL, just click the "Refresh Future Session Links" button
-- on your Video Setup page. It will:
-- ✅ Create new Zoom meetings automatically
-- ✅ Update all fields correctly
-- ✅ Handle errors gracefully




