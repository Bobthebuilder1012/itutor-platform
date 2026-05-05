-- =====================================================
-- AUTO-ARCHIVE INACTIVE GROUPS
-- Adds visit tracking, activity log, and archived_reason
-- =====================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Track tutor visits to their group pages (resets inactivity timer)
CREATE TABLE IF NOT EXISTS public.group_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_visits_lookup
  ON public.group_visits (group_id, visited_at DESC);

ALTER TABLE public.group_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_visits_insert"
ON public.group_visits FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "group_visits_select"
ON public.group_visits FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Audit log for archive/restore actions
CREATE TABLE IF NOT EXISTS public.group_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_group
  ON public.group_activity_log (group_id, created_at DESC);

ALTER TABLE public.group_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_activity_log_select"
ON public.group_activity_log FOR SELECT TO authenticated
USING (
  tutor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);
