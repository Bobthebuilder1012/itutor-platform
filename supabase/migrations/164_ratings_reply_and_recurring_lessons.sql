-- ============================================================
-- MIGRATION 130: RATINGS TUTOR REPLY + RECURRING LESSONS
-- iTutor Database
-- ============================================================
-- Purely additive. No drops, no renames, no destructive changes.
-- Safe to run on staging or production at any time.
-- ============================================================


-- ============================================================
-- STEP 1: Add tutor reply columns to ratings
-- ============================================================
-- Allows tutors to respond to student reviews.
-- No code reads these yet â€” wire the UI separately.

ALTER TABLE IF EXISTS ratings
  ADD COLUMN IF NOT EXISTS tutor_reply text,
  ADD COLUMN IF NOT EXISTS tutor_replied_at timestamptz;

-- ============================================================
-- STEP 2: Create recurring_lesson_templates
-- ============================================================
-- Supports 1:1 recurring lessons. A template defines a repeating
-- pattern; a scheduled job/edge function materializes bookings.

CREATE TABLE IF NOT EXISTS recurring_lesson_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  tutor_id uuid NOT NULL REFERENCES profiles(id),
  student_id uuid NOT NULL REFERENCES profiles(id),
  parent_id uuid REFERENCES profiles(id),

  -- What
  subject_id uuid NOT NULL REFERENCES subjects(id),
  session_type_id uuid REFERENCES session_types(id),

  -- When (recurrence pattern)
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0 = Sunday, 6 = Saturday
  start_time time NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  timezone text NOT NULL DEFAULT 'America/Port_of_Spain',

  -- Pricing
  price_ttd numeric(10,2) NOT NULL CHECK (price_ttd >= 0),
  currency text NOT NULL DEFAULT 'TTD',

  -- Lifecycle
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  starts_on date NOT NULL,
  ends_on date,
  max_occurrences int,

  -- Tracking
  last_generated_date date,
  total_generated int NOT NULL DEFAULT 0,

  -- Parent approval
  requires_parent_approval boolean NOT NULL DEFAULT false,

  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT rlt_valid_date_range CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT rlt_valid_max_occurrences CHECK (max_occurrences IS NULL OR max_occurrences > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rlt_tutor_id
  ON recurring_lesson_templates(tutor_id);
CREATE INDEX IF NOT EXISTS idx_rlt_student_id
  ON recurring_lesson_templates(student_id);
CREATE INDEX IF NOT EXISTS idx_rlt_status
  ON recurring_lesson_templates(status);
CREATE INDEX IF NOT EXISTS idx_rlt_active_generation
  ON recurring_lesson_templates(status, last_generated_date)
  WHERE status = 'active';

-- RLS
ALTER TABLE recurring_lesson_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rlt_tutor_select ON recurring_lesson_templates;
CREATE POLICY rlt_tutor_select ON recurring_lesson_templates
  FOR SELECT USING (auth.uid() = tutor_id);
DROP POLICY IF EXISTS rlt_student_select ON recurring_lesson_templates;
CREATE POLICY rlt_student_select ON recurring_lesson_templates
  FOR SELECT USING (auth.uid() = student_id);
DROP POLICY IF EXISTS rlt_parent_select ON recurring_lesson_templates;
CREATE POLICY rlt_parent_select ON recurring_lesson_templates
  FOR SELECT USING (auth.uid() = parent_id);
DROP POLICY IF EXISTS rlt_tutor_insert ON recurring_lesson_templates;
CREATE POLICY rlt_tutor_insert ON recurring_lesson_templates
  FOR INSERT WITH CHECK (auth.uid() = tutor_id);
DROP POLICY IF EXISTS rlt_tutor_update ON recurring_lesson_templates;
CREATE POLICY rlt_tutor_update ON recurring_lesson_templates
  FOR UPDATE USING (auth.uid() = tutor_id);

-- Updated_at auto-set
CREATE OR REPLACE FUNCTION fn_rlt_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_rlt_updated_at ON recurring_lesson_templates;
CREATE TRIGGER trg_rlt_updated_at
  BEFORE UPDATE ON recurring_lesson_templates
  FOR EACH ROW
  EXECUTE FUNCTION fn_rlt_set_updated_at();

-- ============================================================
-- VERIFICATION
-- ============================================================

-- ratings columns:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'ratings'
--   AND column_name IN ('tutor_reply', 'tutor_replied_at');
-- Expected: 2 rows

-- recurring_lesson_templates:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'recurring_lesson_templates';
-- Expected: 1 row

-- RLS enabled:
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname = 'recurring_lesson_templates';
-- Expected: relrowsecurity = true

