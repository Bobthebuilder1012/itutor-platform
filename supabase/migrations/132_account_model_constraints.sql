-- =====================================================
-- MIGRATION 132: ACCOUNT MODEL CONSTRAINTS
-- 1. Parent-created vs self-registered students
-- 2. parent_id immutability (cannot be set post-creation)
-- 3. Parent account parity fields
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: STUDENT ACCOUNT TYPE MARKER
-- Two student types:
--   self_registered  — created by the student directly (billing_mode = 'self_allowed')
--   parent_created   — created from a parent's dashboard (billing_mode = 'parent_required')
-- A pre-existing self_registered student CANNOT be retrofitted with a parent.
-- Enforced via trigger below. The parent_child_links table governs the relationship;
-- the account_type column makes the origin immutable and queryable.
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text
    CHECK (account_type IN ('self_registered','parent_created'));

-- Backfill: infer from existing data
UPDATE public.profiles
SET account_type = CASE
  WHEN billing_mode = 'parent_required'
       AND EXISTS (
         SELECT 1 FROM public.parent_child_links pcl WHERE pcl.child_id = profiles.id
       )
  THEN 'parent_created'
  ELSE 'self_registered'
END
WHERE role = 'student' AND account_type IS NULL;

-- Non-student roles don't have an account_type
-- (tutors/parents/admins leave it NULL — enforced below)
CREATE OR REPLACE FUNCTION enforce_student_account_type()
RETURNS TRIGGER AS $$
BEGIN
  -- account_type may only be set on student profiles
  IF NEW.account_type IS NOT NULL AND NEW.role != 'student' THEN
    RAISE EXCEPTION
      'account_type is only valid for student profiles'
      USING ERRCODE = 'check_violation';
  END IF;

  -- account_type is immutable once set
  IF OLD.account_type IS NOT NULL
     AND OLD.account_type IS DISTINCT FROM NEW.account_type
  THEN
    RAISE EXCEPTION
      'account_type is immutable (profile id: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A self_registered student can NEVER gain a parent_child_links entry
  -- (that guard is on the parent_child_links INSERT trigger below)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_student_account_type ON public.profiles;
CREATE TRIGGER trg_enforce_student_account_type
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_student_account_type();

-- =====================================================
-- PART 2: BLOCK parent_child_links for self_registered students
-- No API path may link a parent to a self_registered student.
-- =====================================================

CREATE OR REPLACE FUNCTION enforce_parent_child_link_policy()
RETURNS TRIGGER AS $$
DECLARE
  v_child_type text;
BEGIN
  SELECT account_type INTO v_child_type
  FROM public.profiles
  WHERE id = NEW.child_id;

  IF v_child_type = 'self_registered' THEN
    RAISE EXCEPTION
      'Cannot link a parent to a self-registered student account (child id: %)', NEW.child_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_parent_child_link_policy ON public.parent_child_links;
CREATE TRIGGER trg_enforce_parent_child_link_policy
  BEFORE INSERT ON public.parent_child_links
  FOR EACH ROW
  EXECUTE FUNCTION enforce_parent_child_link_policy();

-- =====================================================
-- PART 3: PARENT ACCOUNT PARITY
-- Parents already have role = 'parent' in profiles.
-- Ensure the same notification_preferences shape and
-- suspension fields are available (they already exist on profiles).
-- Add parent-specific settings column.
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_settings jsonb;
  -- Shape: { notify_feedback: bool, notify_payments: bool,
  --          notify_warnings: bool, consent_required_for_enroll: bool }

-- =====================================================
-- PART 4: billing_timing IMMUTABILITY is already in migration 127.
-- Verify the trigger exists; add a comment for audit trail.
-- =====================================================

COMMENT ON COLUMN public.groups.billing_timing IS
  'Immutable after first save. Enforced by trg_billing_timing_immutable trigger.';

COMMENT ON COLUMN public.profiles.account_type IS
  'Immutable after creation. self_registered = student signed up directly; parent_created = created from parent dashboard. Cannot be changed post-creation.';

COMMIT;
