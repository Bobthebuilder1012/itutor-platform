-- Self-reported attendance: one row per session (single student per session).
-- No row = student has not responded yet.

CREATE TABLE IF NOT EXISTS public.session_student_attendance (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status = ANY (ARRAY['attending'::text, 'not_attending'::text])),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_student_attendance_student_id
  ON public.session_student_attendance(student_id);

COMMENT ON TABLE public.session_student_attendance IS 'Student self-reported plan to attend; tutors do not edit this.';

CREATE OR REPLACE FUNCTION public.session_student_attendance_set_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
BEGIN
  SELECT s.student_id INTO v_student FROM public.sessions s WHERE s.id = NEW.session_id;
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  NEW.student_id := v_student;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_student_attendance_bi ON public.session_student_attendance;
CREATE TRIGGER trg_session_student_attendance_bi
  BEFORE INSERT ON public.session_student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.session_student_attendance_set_student();

CREATE OR REPLACE FUNCTION public.session_student_attendance_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_student_attendance_bu ON public.session_student_attendance;
CREATE TRIGGER trg_session_student_attendance_bu
  BEFORE UPDATE ON public.session_student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.session_student_attendance_touch();

ALTER TABLE public.session_student_attendance ENABLE ROW LEVEL SECURITY;

-- Students: read own rows
CREATE POLICY session_student_attendance_student_select
  ON public.session_student_attendance
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Parents: read rows for linked children only
CREATE POLICY session_student_attendance_parent_select
  ON public.session_student_attendance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_child_links pcl
      WHERE pcl.parent_id = auth.uid()
        AND pcl.child_id = session_student_attendance.student_id
    )
  );

-- Students may insert only for their own upcoming schedulable sessions (cutoff = session start in DB)
CREATE POLICY session_student_attendance_student_insert
  ON public.session_student_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
    AND student_id = auth.uid()
  );

CREATE POLICY session_student_attendance_student_update
  ON public.session_student_attendance
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_student_attendance.session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  );

CREATE POLICY session_student_attendance_student_delete
  ON public.session_student_attendance
  FOR DELETE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_student_attendance.session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  );
