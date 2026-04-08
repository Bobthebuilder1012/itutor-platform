-- Cache one provider meeting link at group-session level.
-- This prevents fallback joins from generating a new meeting each click.

ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_external_id text,
  ADD COLUMN IF NOT EXISTS meeting_join_url text,
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_sessions_meeting_join_url
  ON public.group_sessions(meeting_join_url)
  WHERE meeting_join_url IS NOT NULL;

