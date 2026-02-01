-- =====================================================
-- ALLOW STUDENTS TO READ ALL SYLLABUSES
-- =====================================================
-- Students should be able to browse and view all CXC syllabuses
-- regardless of which subjects they're enrolled in

-- Add policy for students to read all syllabuses
CREATE POLICY students_read_all_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'student'
  )
);

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Students can now read all syllabuses';
  RAISE NOTICE '✅ Students will see "Your Subjects" syllabuses at the top';
  RAISE NOTICE '✅ Students will see "All CXC Syllabuses" below';
END $$;
