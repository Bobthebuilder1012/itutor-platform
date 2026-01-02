-- =====================================================
-- UPDATE SYLLABUSES RLS POLICY
-- =====================================================
-- Allow tutors to read ALL syllabuses (not just their subjects)
-- This enables the "All CXC Syllabuses" reference library

-- Drop the restrictive policy
DROP POLICY IF EXISTS tutors_read_own_syllabuses ON syllabuses;

-- Create new policy: All tutors can read all syllabuses
CREATE POLICY tutors_read_all_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'tutor'
  )
);

DO $$
BEGIN
  RAISE NOTICE '✅ Tutors can now read all syllabuses';
  RAISE NOTICE '✅ "All CXC Syllabuses" section will now work correctly';
END $$;



