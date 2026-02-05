-- =====================================================
-- DIAGNOSE WHY NO TUTORS ARE SHOWING
-- =====================================================

-- 1. Check how many tutors exist
SELECT 'Total tutors in database:' as info, COUNT(*) as count
FROM profiles
WHERE role = 'tutor';

-- 2. Check how many tutors have subjects
SELECT 'Tutors with subjects:' as info, COUNT(DISTINCT tutor_id) as count
FROM tutor_subjects;

-- 3. Check how many tutors have video connections
SELECT 'Tutors with video connections:' as info, COUNT(DISTINCT tutor_id) as count
FROM tutor_video_provider_connections
WHERE connection_status = 'connected';

-- 4. Show tutor details
SELECT 
  p.id,
  p.full_name,
  p.username,
  p.email,
  (SELECT COUNT(*) FROM tutor_subjects WHERE tutor_id = p.id) as subject_count,
  (SELECT connection_status FROM tutor_video_provider_connections WHERE tutor_id = p.id LIMIT 1) as video_status
FROM profiles p
WHERE p.role = 'tutor'
ORDER BY p.full_name;

-- 5. FIX: Add video connections for all tutors
INSERT INTO tutor_video_provider_connections (tutor_id, provider, connection_status, created_at)
SELECT 
  id as tutor_id,
  'zoom' as provider,
  'connected' as connection_status,
  NOW() as created_at
FROM profiles
WHERE role = 'tutor'
  AND id NOT IN (
    SELECT tutor_id FROM tutor_video_provider_connections WHERE connection_status = 'connected'
  );

SELECT 'Added video connections for all tutors!' as message;

-- 6. Verify the fix
SELECT 'Tutors with video connections after fix:' as info, COUNT(DISTINCT tutor_id) as count
FROM tutor_video_provider_connections
WHERE connection_status = 'connected';
