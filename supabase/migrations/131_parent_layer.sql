-- =====================================================
-- MIGRATION 131: PARENT LAYER
-- parent_consents, parent_feedback_reports, feedback_templates
-- =====================================================

BEGIN;

-- =====================================================
-- TABLE: parent_consents
-- Records a parent's consent to a child's class enrollment.
-- Separate from parent_child_links (relationship) and
-- group_members (enrollment). This is the audit record.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.parent_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The specific group_members row this consent covers
  class_member_id uuid NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,

  consented_at timestamptz NOT NULL DEFAULT now(),

  -- How this consent was initiated
  initiated_by text NOT NULL
    CHECK (initiated_by IN ('student_request','parent_direct')),

  -- Snapshot of billing/class terms at time of consent (immutable)
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Populated when parent withdraws consent (child unenrolled)
  unenrolled_at timestamptz,

  CONSTRAINT parent_consents_unique_active
    UNIQUE (parent_id, class_member_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_consents_parent
  ON public.parent_consents(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_consents_member
  ON public.parent_consents(class_member_id);

ALTER TABLE public.parent_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_consents_parent_all"
ON public.parent_consents FOR ALL TO authenticated
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

-- Tutors see consents for their class members (read-only)
CREATE POLICY "parent_consents_tutor_select"
ON public.parent_consents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id AND g.tutor_id = auth.uid()
  )
);

-- =====================================================
-- TABLE: feedback_templates
-- Per-tutor prompt library. Seeded with 5 defaults per tutor.
-- Distinct from group_feedback_settings (per-group config).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.feedback_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Array of prompt objects: [{key, label, placeholder}]
  prompts jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One template set per tutor
  CONSTRAINT feedback_templates_unique_tutor UNIQUE (tutor_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_templates_tutor
  ON public.feedback_templates(tutor_id);

CREATE TRIGGER trg_feedback_templates_updated_at
  BEFORE UPDATE ON public.feedback_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.feedback_templates ENABLE ROW LEVEL SECURITY;

-- Tutor manages their own template
CREATE POLICY "feedback_templates_tutor_all"
ON public.feedback_templates FOR ALL TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- =====================================================
-- SEED: default feedback_templates for all existing tutors
-- 5 standard prompts per the spec.
-- =====================================================

INSERT INTO public.feedback_templates (tutor_id, prompts)
SELECT
  p.id,
  '[
    {"key":"covered",       "label":"What was covered",       "placeholder":"Describe the topics and material covered this period."},
    {"key":"strength",      "label":"A strength",             "placeholder":"Highlight something the student did particularly well."},
    {"key":"struggles",     "label":"Areas of struggle",      "placeholder":"Note any concepts or skills the student found difficult."},
    {"key":"engagement",    "label":"Engagement",             "placeholder":"Comment on the student\u2019s participation and focus."},
    {"key":"recommendation","label":"Recommendation",         "placeholder":"What should the student focus on or practise before the next session?"}
  ]'::jsonb
FROM public.profiles p
WHERE p.role = 'tutor'
ON CONFLICT (tutor_id) DO NOTHING;

-- =====================================================
-- TRIGGER: auto-seed feedback_templates for new tutors
-- =====================================================

CREATE OR REPLACE FUNCTION seed_feedback_template_for_new_tutor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'tutor' THEN
    INSERT INTO public.feedback_templates (tutor_id, prompts)
    VALUES (
      NEW.id,
      '[
        {"key":"covered",       "label":"What was covered",       "placeholder":"Describe the topics and material covered this period."},
        {"key":"strength",      "label":"A strength",             "placeholder":"Highlight something the student did particularly well."},
        {"key":"struggles",     "label":"Areas of struggle",      "placeholder":"Note any concepts or skills the student found difficult."},
        {"key":"engagement",    "label":"Engagement",             "placeholder":"Comment on the student\u2019s participation and focus."},
        {"key":"recommendation","label":"Recommendation",         "placeholder":"What should the student focus on or practise before the next session?"}
      ]'::jsonb
    )
    ON CONFLICT (tutor_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_feedback_template ON public.profiles;
CREATE TRIGGER trg_seed_feedback_template
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION seed_feedback_template_for_new_tutor();

-- =====================================================
-- TABLE: parent_feedback_reports
-- Polished per-student deliverable report authored by the tutor.
-- Distinct from group_feedback_entries (internal ratings tool).
-- No ai_draft field — tutor authors the report directly.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.parent_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The enrollment this report is for
  class_member_id uuid NOT NULL
    REFERENCES public.group_members(id) ON DELETE CASCADE,

  -- e.g. '2026-05' for monthly, or a session occurrence id stringified
  period text NOT NULL,

  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','tutor_approved','sent','refunded')),

  -- Tutor's responses to their configured prompts (keyed by prompt key)
  prompt_responses jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The final compiled report text (tutor-written)
  final_text text,

  due_at timestamptz,
  sent_at timestamptz,

  -- If parent_feedback_mode = 'paid', tracks which class_payment funded this
  class_payment_id uuid
    REFERENCES public.class_payments(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pfr_unique_member_period UNIQUE (class_member_id, period)
);

CREATE INDEX IF NOT EXISTS idx_pfr_member
  ON public.parent_feedback_reports(class_member_id);
CREATE INDEX IF NOT EXISTS idx_pfr_status
  ON public.parent_feedback_reports(status)
  WHERE status IN ('not_started','in_progress');
CREATE INDEX IF NOT EXISTS idx_pfr_due
  ON public.parent_feedback_reports(due_at)
  WHERE sent_at IS NULL;

CREATE TRIGGER trg_pfr_updated_at
  BEFORE UPDATE ON public.parent_feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.parent_feedback_reports ENABLE ROW LEVEL SECURITY;

-- Tutors see/manage reports for their class members
CREATE POLICY "pfr_tutor_all"
ON public.parent_feedback_reports FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id AND g.tutor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id AND g.tutor_id = auth.uid()
  )
);

-- Parents see sent reports for their children
CREATE POLICY "pfr_parent_select"
ON public.parent_feedback_reports FOR SELECT TO authenticated
USING (
  status = 'sent'
  AND EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.parent_child_links pcl ON pcl.child_id = gm.user_id
    WHERE gm.id = class_member_id AND pcl.parent_id = auth.uid()
  )
);

-- Students can see sent reports about themselves
CREATE POLICY "pfr_student_select"
ON public.parent_feedback_reports FOR SELECT TO authenticated
USING (
  status = 'sent'
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.id = class_member_id AND gm.user_id = auth.uid()
  )
);

COMMIT;
