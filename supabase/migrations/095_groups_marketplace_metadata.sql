-- Groups marketplace metadata and analytics support (backward-compatible)

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS form_level text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS session_length_minutes integer,
  ADD COLUMN IF NOT EXISTS session_frequency text,
  ADD COLUMN IF NOT EXISTS price_per_course numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_mode text,
  ADD COLUMN IF NOT EXISTS availability_window text,
  ADD COLUMN IF NOT EXISTS media_gallery jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_groups_form_level ON public.groups(form_level);
CREATE INDEX IF NOT EXISTS idx_groups_session_frequency ON public.groups(session_frequency);
CREATE INDEX IF NOT EXISTS idx_groups_price_per_course ON public.groups(price_per_course);

ALTER TABLE public.group_attendance_records
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS participation_score numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_group_attendance_marked_at
  ON public.group_attendance_records(marked_at DESC);
