-- =====================================================
-- MIGRATION 220: ATTENDANCE DERIVATION (§6, §10.2)
-- =====================================================
-- Migration 218 made attendance unwritable by users. This one gives it the
-- shape §10.2 asks for and adds the missing half of §6.
--
-- WHAT A ROW MEANS, RESTATED
-- Migration 196 established the model: a row in session_attendance_log means
-- the student clicked Join for that occurrence. Absence is INFERRED from the
-- lack of a row by session end; nobody writes 'absent'. That is why the status
-- column below can only ever hold 'attended' or 'late' in practice even though
-- the CHECK admits all four values §10.2 names — 'absent' has no row to live
-- on, and 'cancelled' is a property of the session, not of a student.
--
-- Storing the derived status rather than recomputing it on every read is
-- deliberate: lateness is a fact about a moment that has passed, and a session
-- that is later rescheduled must not retroactively turn a punctual student
-- late. derived_at records when the judgement was made.
--
-- THE TUTOR-ABSENT GUARD NEEDS DATA THAT DOES NOT EXIST YET
-- §6: "If the tutor never joined, the session did not happen: mark nobody
-- absent, exclude from all rates. Use the tutor's own join event."
--
-- There is no tutor join event anywhere in this schema. The group join-link
-- route explicitly skips attendance for tutors (`if (!isTutor)`), so today the
-- guard cannot fire and every student in a class the tutor never showed up to
-- is silently marked absent — the worst possible failure, since it is invisible
-- and it damages the rate of the one party who did nothing wrong.
--
-- session_attendance_log cannot hold it: student_id is NOT NULL and the unique
-- key is per student. So tutor joins get their own table, with the same
-- read-only-to-users posture as migration 218 established.
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- §10.2 columns
-- ---------------------------------------------------------------
ALTER TABLE public.session_attendance_log
  ADD COLUMN IF NOT EXISTS status        text,
  ADD COLUMN IF NOT EXISTS late_minutes  integer,
  ADD COLUMN IF NOT EXISTS derived_at    timestamptz,
  -- Reserved by §10.2. No join-events table exists in this schema: the click IS
  -- the event and joined_at is its timestamp. Kept nullable and unused rather
  -- than invented, so that if a join-events table is added later this is where
  -- it attaches.
  ADD COLUMN IF NOT EXISTS join_event_id uuid,
  -- Which endpoint vouched for the join. Real provenance, available now: a row
  -- from the group join-link route was issued an actual meeting link, whereas a
  -- mark-present row was verified separately. Worth being able to tell apart
  -- when an attendance record is disputed.
  ADD COLUMN IF NOT EXISTS join_source   text;

ALTER TABLE public.session_attendance_log
  DROP CONSTRAINT IF EXISTS session_attendance_log_status_check;
ALTER TABLE public.session_attendance_log
  ADD CONSTRAINT session_attendance_log_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY['attended','late','absent','cancelled']));

COMMENT ON COLUMN public.session_attendance_log.status IS
  '§6 derived status. In practice only attended|late are ever stored: absent is the absence of a row (mig 196) and cancelled belongs to the session. NULL on rows written before migration 220.';
COMMENT ON COLUMN public.session_attendance_log.late_minutes IS
  '§6: join minus scheduled start, whole minutes. NULL when on time.';

-- Backfill is deliberately NOT attempted. Deriving a status needs the scheduled
-- start of each occurrence at the time of the join, and for rows written before
-- this migration the honest answer is that we recorded presence and never
-- judged punctuality. Writing 'attended' across the board would invent a fact;
-- the read helper treats NULL as "present, punctuality unknown".

-- ---------------------------------------------------------------
-- Tutor join events — what makes the §6 guard possible
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_tutor_join_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  occurrence_type text NOT NULL CHECK (occurrence_type IN ('session', 'group_occurrence')),
  occurrence_id   uuid NOT NULL,
  group_id        uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  join_source     text,
  UNIQUE (tutor_id, occurrence_type, occurrence_id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_join_log_occurrence
  ON public.session_tutor_join_log (occurrence_type, occurrence_id);
CREATE INDEX IF NOT EXISTS idx_tutor_join_log_tutor
  ON public.session_tutor_join_log (tutor_id);

ALTER TABLE public.session_tutor_join_log ENABLE ROW LEVEL SECURITY;

-- Same posture as migration 218: readable by the people it concerns, writable
-- only by the service role from the join endpoint. A tutor who could insert
-- here could manufacture the evidence that a session happened, which would
-- reinstate every absence the guard had correctly suppressed.
DROP POLICY IF EXISTS "tutor reads own join log" ON public.session_tutor_join_log;
CREATE POLICY "tutor reads own join log" ON public.session_tutor_join_log
  FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

-- Students and parents need this to be readable, because it is the reason an
-- occurrence is excluded from a rate. A rate that silently drops a session
-- looks like a bug unless the reason can be shown.
DROP POLICY IF EXISTS "student reads join log for own occurrences" ON public.session_tutor_join_log;
CREATE POLICY "student reads join log for own occurrences" ON public.session_tutor_join_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_attendance_log a
      WHERE a.occurrence_type = session_tutor_join_log.occurrence_type
        AND a.occurrence_id   = session_tutor_join_log.occurrence_id
        AND (
          a.student_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.parent_child_links l
            WHERE l.parent_id = auth.uid() AND l.child_id = a.student_id
          )
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.session_tutor_join_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_tutor_join_log FROM anon;

COMMIT;
