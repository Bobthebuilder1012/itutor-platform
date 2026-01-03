-- =====================================================
-- CURRICULUM SYLLABUSES SCHEMA
-- =====================================================
-- Creates syllabuses table to store official CXC syllabus PDFs
-- Designed for future scalability with units/topics/lesson mappings

-- =============================================================================
-- 1. CREATE SYLLABUSES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS syllabuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  qualification text NOT NULL CHECK (qualification IN ('CSEC', 'CAPE')),
  category text NOT NULL,
  title text NOT NULL,
  version text,
  effective_year integer,
  pdf_url text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate syllabus versions for same subject
  CONSTRAINT unique_subject_version UNIQUE (subject_id, version)
);

-- =============================================================================
-- 2. CREATE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_syllabuses_subject_id ON syllabuses(subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabuses_qualification ON syllabuses(qualification);
CREATE INDEX IF NOT EXISTS idx_syllabuses_category ON syllabuses(category);

-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE syllabuses ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. CREATE RLS POLICIES
-- =============================================================================

-- Policy: Tutors can read syllabuses for subjects they teach
CREATE POLICY tutors_read_own_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  subject_id IN (
    SELECT subject_id 
    FROM tutor_subjects 
    WHERE tutor_id = auth.uid()
  )
);

-- Policy: Admins and reviewers have full access
CREATE POLICY admins_manage_syllabuses ON syllabuses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- =============================================================================
-- 5. CREATE UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_syllabuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER syllabuses_updated_at
BEFORE UPDATE ON syllabuses
FOR EACH ROW
EXECUTE FUNCTION update_syllabuses_updated_at();

-- =============================================================================
-- 6. FUTURE SCALABILITY NOTES
-- =============================================================================

COMMENT ON TABLE syllabuses IS 'Official CXC syllabuses linked to subjects. Future tables: syllabus_units (syllabus_id, unit_number, title), syllabus_topics (unit_id, topic_number, title, learning_outcomes), lesson_topic_mappings (lesson_id, topic_id), student_topic_progress (student_id, topic_id, status)';

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Syllabuses table created successfully';
  RAISE NOTICE '✅ RLS policies applied for tutor and admin access';
  RAISE NOTICE '✅ Indexes created for performance';
  RAISE NOTICE '✅ Ready for seed data (run 030_seed_syllabuses.sql next)';
END $$;






