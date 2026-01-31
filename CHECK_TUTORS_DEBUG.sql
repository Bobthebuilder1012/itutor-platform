-- Check tutors and their data
-- Run this in Supabase SQL Editor

-- 1. Check all tutors
SELECT 
  id,
  full_name,
  username,
  display_name,
  role,
  tutor_verification_status,
  country
FROM profiles 
WHERE role = 'tutor'
ORDER BY created_at DESC;

-- 2. Check video provider connections
SELECT 
  t.tutor_id,
  t.provider,
  t.connection_status,
  p.full_name,
  p.username
FROM tutor_video_provider_connections t
JOIN profiles p ON p.id = t.tutor_id;

-- 3. Check tutor subjects
SELECT 
  ts.tutor_id,
  p.full_name,
  p.username,
  s.name as subject_name,
  s.label as subject_label,
  ts.price_per_hour_ttd
FROM tutor_subjects ts
JOIN profiles p ON p.id = ts.tutor_id
JOIN subjects s ON s.id = ts.subject_id
ORDER BY p.full_name;

-- 4. Combined check: Tutors with video AND subjects
SELECT 
  p.id,
  p.full_name,
  p.username,
  p.tutor_verification_status,
  vpc.provider,
  vpc.connection_status,
  COUNT(ts.id) as subject_count
FROM profiles p
LEFT JOIN tutor_video_provider_connections vpc ON vpc.tutor_id = p.id
LEFT JOIN tutor_subjects ts ON ts.tutor_id = p.id
WHERE p.role = 'tutor'
GROUP BY p.id, p.full_name, p.username, p.tutor_verification_status, vpc.provider, vpc.connection_status
ORDER BY subject_count DESC;

-- 5. Check if there are any RLS policy issues
-- This shows which policies exist on the tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('profiles', 'tutor_subjects', 'tutor_video_provider_connections', 'subjects')
ORDER BY tablename, policyname;
