-- =====================================================
-- MIGRATION 196: CLICK-BASED ATTENDANCE
-- =====================================================
-- Attendance = did the student click Join. A row here == Present for that
-- session/occurrence; no row by session end == Absent (absence is inferred, not
-- written). Replaces the old self-reported (session_student_attendance) and
-- tutor-marked (group_attendance_records) systems — neither of which exists on
-- staging anyway. No participation score, no tutor override (product decision).
--
-- occurrence_type distinguishes the two schedule systems:
--   'session'          → occurrence_id = sessions.id (1:1)
--   'group_occurrence' → occurrence_id = group_session_occurrences.id (group)
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.session_attendance_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  occurrence_type text NOT NULL CHECK (occurrence_type IN ('session', 'group_occurrence')),
  occurrence_id   uuid NOT NULL,
  group_id        uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, occurrence_type, occurrence_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_log_student ON public.session_attendance_log (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_log_occurrence ON public.session_attendance_log (occurrence_type, occurrence_id);

ALTER TABLE public.session_attendance_log ENABLE ROW LEVEL SECURITY;

-- Student records/reads their own attendance (the Join click posts as the student).
DROP POLICY IF EXISTS "student manages own attendance" ON public.session_attendance_log;
CREATE POLICY "student manages own attendance" ON public.session_attendance_log
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Parent may read a linked child's attendance (defense in depth; the parent
-- dashboard reads via a service-client API, mirroring the other child data).
DROP POLICY IF EXISTS "parent reads child attendance" ON public.session_attendance_log;
CREATE POLICY "parent reads child attendance" ON public.session_attendance_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parent_child_links l
    WHERE l.parent_id = auth.uid() AND l.child_id = session_attendance_log.student_id
  ));

COMMIT;
