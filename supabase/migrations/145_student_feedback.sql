-- Feedback settings per group (tutor configures)
CREATE TABLE IF NOT EXISTS public.group_feedback_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('session', 'weekly', 'monthly')),
  deadline_days integer NOT NULL DEFAULT 3,
  include_ratings boolean NOT NULL DEFAULT true,
  notify_students boolean NOT NULL DEFAULT true,
  allow_parent_access boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

CREATE INDEX IF NOT EXISTS idx_gfs_group ON public.group_feedback_settings (group_id);

-- Feedback periods (auto-generated or triggered by session)
CREATE TABLE IF NOT EXISTS public.group_feedback_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('session', 'weekly', 'monthly')),
  period_label text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gfp_group ON public.group_feedback_periods (group_id, period_end DESC);

-- Individual feedback entries (one per student per period)
CREATE TABLE IF NOT EXISTS public.group_feedback_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.group_feedback_periods(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  tutor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'skipped')),
  rating_participation integer CHECK (rating_participation BETWEEN 1 AND 5),
  rating_understanding integer CHECK (rating_understanding BETWEEN 1 AND 5),
  rating_effort integer CHECK (rating_effort BETWEEN 1 AND 5),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_gfe_period ON public.group_feedback_entries (period_id);
CREATE INDEX IF NOT EXISTS idx_gfe_student ON public.group_feedback_entries (student_id, group_id);

-- RLS
ALTER TABLE public.group_feedback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feedback_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feedback_entries ENABLE ROW LEVEL SECURITY;

-- Settings: tutor of the group can read/write
CREATE POLICY gfs_tutor_all ON public.group_feedback_settings
  FOR ALL USING (
    group_id IN (SELECT id FROM public.groups WHERE tutor_id = auth.uid())
  );

-- Periods: tutor can manage, members can read
CREATE POLICY gfp_tutor_all ON public.group_feedback_periods
  FOR ALL USING (
    group_id IN (SELECT id FROM public.groups WHERE tutor_id = auth.uid())
  );

CREATE POLICY gfp_member_read ON public.group_feedback_periods
  FOR SELECT USING (
    group_id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- Entries: tutor can manage all, student can read own
CREATE POLICY gfe_tutor_all ON public.group_feedback_entries
  FOR ALL USING (tutor_id = auth.uid());

CREATE POLICY gfe_student_read ON public.group_feedback_entries
  FOR SELECT USING (student_id = auth.uid() AND status = 'submitted');
