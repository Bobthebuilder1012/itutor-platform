-- =============================================================================
-- 069: Feedback lock based on scheduled end time (not session status)
-- =============================================================================
-- The cron that updates session status may lag. For mandatory feedback, treat
-- sessions as "ended" when scheduled_end_at <= now(), regardless of status,
-- excluding CANCELLED.

-- Update tutor_feedback insert policy to allow SCHEDULED/JOIN_OPEN/COMPLETED_ASSUMED once end time has passed.
DROP POLICY IF EXISTS "Tutors can submit feedback for completed sessions" ON public.tutor_feedback;
CREATE POLICY "Tutors can submit feedback for completed sessions"
ON public.tutor_feedback FOR INSERT
TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = tutor_feedback.session_id
      AND s.tutor_id = auth.uid()
      AND s.student_id = tutor_feedback.student_id
      AND s.status <> 'CANCELLED'
      AND s.scheduled_end_at <= now()
  )
);

-- Update ratings insert policy similarly.
DROP POLICY IF EXISTS "Students can rate their completed sessions" ON public.ratings;
CREATE POLICY "Students can rate their completed sessions"
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = ratings.session_id
      AND s.student_id = auth.uid()
      AND s.tutor_id = ratings.tutor_id
      AND s.status <> 'CANCELLED'
      AND s.scheduled_end_at <= now()
  )
);

-- Update pending feedback RPCs to ignore status lag.
CREATE OR REPLACE FUNCTION public.pending_student_rating_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.ratings r ON r.session_id = s.id
  WHERE s.student_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND r.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.pending_tutor_feedback_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.tutor_feedback tf ON tf.session_id = s.id
  WHERE s.tutor_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND tf.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_tutor_feedback_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_tutor_feedback_session() TO authenticated;

