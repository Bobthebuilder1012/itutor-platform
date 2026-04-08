CREATE TABLE IF NOT EXISTS public.session_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('attending', 'not_attending')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_rsvp_occurrence_student UNIQUE (occurrence_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_rsvps_occurrence ON public.session_rsvps(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_session_rsvps_student ON public.session_rsvps(student_id);

ALTER TABLE public.session_rsvps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_rsvps' AND policyname='Session rsvps select'
  ) THEN
    CREATE POLICY "Session rsvps select" ON public.session_rsvps
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_session_occurrences o
          JOIN public.group_sessions s ON s.id = o.group_session_id
          JOIN public.groups g ON g.id = s.group_id
          WHERE o.id = occurrence_id AND g.tutor_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_rsvps' AND policyname='Session rsvps upsert own'
  ) THEN
    CREATE POLICY "Session rsvps upsert own" ON public.session_rsvps
      FOR ALL TO authenticated
      USING (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());
  END IF;
END $$;
