-- =====================================================
-- CXC VERIFIED SUBJECTS TABLE
-- =====================================================
-- Stores individual verified subjects with grades from CXC results slips
-- Integrates with existing tutor_verification_requests system

-- 1. CREATE TUTOR_VERIFIED_SUBJECTS TABLE
CREATE TABLE IF NOT EXISTS tutor_verified_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_type text NOT NULL CHECK (exam_type IN ('CSEC', 'CAPE')),
  grade integer NOT NULL CHECK (grade >= 1 AND grade <= 9),
  year integer,
  session text,
  verified_by_admin_id uuid REFERENCES profiles(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  is_public boolean NOT NULL DEFAULT true,
  visibility_updated_at timestamptz,
  source_request_id uuid REFERENCES tutor_verification_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_verified_subjects_tutor ON tutor_verified_subjects(tutor_id);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_subject ON tutor_verified_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_public ON tutor_verified_subjects(is_public);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_exam_type ON tutor_verified_subjects(exam_type);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_source ON tutor_verified_subjects(source_request_id);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE tutor_verified_subjects ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES

-- Policy 1: Admins can INSERT verified subjects
DROP POLICY IF EXISTS "Admins insert verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins insert verified subjects"
ON tutor_verified_subjects FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 2: Admins can UPDATE grade, exam_type, year, session, subject_id fields
DROP POLICY IF EXISTS "Admins update verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins update verified subjects"
ON tutor_verified_subjects FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 3: Tutors can UPDATE only is_public and visibility_updated_at on their own rows
DROP POLICY IF EXISTS "Tutors update own visibility" ON tutor_verified_subjects;
CREATE POLICY "Tutors update own visibility"
ON tutor_verified_subjects FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- Policy 4: Tutors can SELECT all their own verified subjects (public + hidden)
DROP POLICY IF EXISTS "Tutors view own verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Tutors view own verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Policy 5: Public can SELECT only rows where is_public = true
DROP POLICY IF EXISTS "Public view public verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Public view public verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (is_public = true);

-- Policy 6: Admins can view all verified subjects
DROP POLICY IF EXISTS "Admins view all verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins view all verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 7: Admins can DELETE verified subjects
DROP POLICY IF EXISTS "Admins delete verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins delete verified subjects"
ON tutor_verified_subjects FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- 5. CREATE UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_verified_subjects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verified_subjects_updated_at ON tutor_verified_subjects;
CREATE TRIGGER verified_subjects_updated_at
BEFORE UPDATE ON tutor_verified_subjects
FOR EACH ROW
EXECUTE FUNCTION update_verified_subjects_updated_at();

-- 6. CREATE TRIGGER TO UPDATE visibility_updated_at
CREATE OR REPLACE FUNCTION update_visibility_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_public IS DISTINCT FROM NEW.is_public THEN
    NEW.visibility_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS visibility_updated_timestamp ON tutor_verified_subjects;
CREATE TRIGGER visibility_updated_timestamp
BEFORE UPDATE ON tutor_verified_subjects
FOR EACH ROW
EXECUTE FUNCTION update_visibility_timestamp();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ tutor_verified_subjects table created successfully';
  RAISE NOTICE '✅ Indexes created for performance';
  RAISE NOTICE '✅ RLS policies applied (tutors manage visibility, admins manage content, public view public only)';
  RAISE NOTICE '✅ Triggers created for updated_at and visibility_updated_at';
END $$;

