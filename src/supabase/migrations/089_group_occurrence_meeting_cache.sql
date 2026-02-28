-- Cache one provider meeting link per group session occurrence
-- so tutors and students always receive the same URL.

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_external_id text,
  ADD COLUMN IF NOT EXISTS meeting_join_url text,
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_meeting_join_url
  ON public.group_session_occurrences(meeting_join_url)
  WHERE meeting_join_url IS NOT NULL;

