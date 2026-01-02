-- Fix RLS policies for tutor_subjects table
-- This allows tutors to insert, update, and delete their own subjects

-- First, check if RLS is enabled (it should be)
-- If you see "Row security is disabled", run: ALTER TABLE tutor_subjects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Tutors can view their own subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Tutors can insert their own subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Tutors can update their own subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Tutors can delete their own subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Allow tutors to view their subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Allow tutors to insert subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Allow tutors to update subjects" ON tutor_subjects;
DROP POLICY IF EXISTS "Allow tutors to delete subjects" ON tutor_subjects;

-- Enable RLS
ALTER TABLE tutor_subjects ENABLE ROW LEVEL SECURITY;

-- Allow tutors to SELECT their own subjects
CREATE POLICY "Tutors can view their own subjects"
  ON tutor_subjects
  FOR SELECT
  TO authenticated
  USING (
    tutor_id = auth.uid()
    OR
    tutor_id IN (
      SELECT id FROM profiles WHERE id = auth.uid() AND role = 'tutor'
    )
  );

-- Allow tutors to INSERT their own subjects
CREATE POLICY "Tutors can insert their own subjects"
  ON tutor_subjects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tutor_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tutor'
    )
  );

-- Allow tutors to UPDATE their own subjects
CREATE POLICY "Tutors can update their own subjects"
  ON tutor_subjects
  FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

-- Allow tutors to DELETE their own subjects
CREATE POLICY "Tutors can delete their own subjects"
  ON tutor_subjects
  FOR DELETE
  TO authenticated
  USING (tutor_id = auth.uid());

-- Allow students/parents to view tutor subjects (for browsing tutors)
CREATE POLICY "Anyone can view tutor subjects"
  ON tutor_subjects
  FOR SELECT
  TO authenticated
  USING (true);
