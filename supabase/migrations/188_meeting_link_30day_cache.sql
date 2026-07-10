-- 30-day rolling meeting-link cache.
--
-- Records WHEN a class's cached Zoom / Google Meet link was generated, so the
-- same link can be reused for 30 days and regenerated afterwards (replacing the
-- old calendar-month key on groups.meeting_link_month).
--
-- Added to BOTH meeting-link stores:
--   * groups.meeting_link              — the "Classes" group-level link
--   * group_sessions.meeting_join_url  — the per-series "Groups/Lessons" link
--
-- Idempotent: safe to re-run.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS meeting_link_generated_at timestamptz;

ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS meeting_link_generated_at timestamptz;
