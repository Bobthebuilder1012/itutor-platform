-- =====================================================
-- ALLOW STUDENTS TO READ TUTOR VIDEO CONNECTIONS
-- =====================================================
-- Students need to see which tutors have video connections set up
-- so they can be displayed on the find-tutors page

-- Check if RLS policy already exists for students
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS students_read_video_connections ON tutor_video_provider_connections;
  
  -- Create new policy allowing students to read video connections
  CREATE POLICY students_read_video_connections ON tutor_video_provider_connections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'student'
    )
  );
  
  RAISE NOTICE '✅ Students can now read tutor video connections';
END $$;

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'tutor_video_provider_connections'
  AND policyname = 'students_read_video_connections';
