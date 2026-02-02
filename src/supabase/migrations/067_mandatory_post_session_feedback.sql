-- =============================================================================
-- 067: Mandatory post-session feedback (student ratings + tutor feedback)
-- =============================================================================
-- - Adds tutor_feedback table (one per session)
-- - Fixes ratings insert eligibility to use session status + scheduled_end_at
-- - Adds RPC helpers for middleware (pending feedback lookups)

-- =============================================================================
-- Table: tutor_feedback
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tutor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tutor_feedback_unique_session UNIQUE (session_id),
  CONSTRAINT tutor_feedback_non_empty CHECK (length(trim(feedback_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tutor_feedback_session_id ON public.tutor_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_tutor_feedback_tutor_created ON public.tutor_feedback(tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutor_feedback_student_created ON public.tutor_feedback(student_id, created_at DESC);

ALTER TABLE public.tutor_feedback ENABLE ROW LEVEL SECURITY;

-- Tutors and students (and parents of the student) can read feedback for relevant sessions.
DROP POLICY IF EXISTS "Tutors can read their feedback" ON public.tutor_feedback;
CREATE POLICY "Tutors can read their feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Students can read their tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Students can read their tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Parents can read children tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Parents can read children tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (public.is_my_child(student_id));

DROP POLICY IF EXISTS "Admins can read all tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Admins can read all tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (public.is_admin());

-- Insert: tutor can submit feedback for their completed sessions after scheduled_end_at.
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
      AND s.status = 'COMPLETED_ASSUMED'
      AND s.scheduled_end_at <= now()
  )
);

-- =============================================================================
-- Fix ratings insert policy (status + scheduled_end_at)
-- =============================================================================

-- Replace the original policy from 001_complete_schema_with_rls.sql which checks status='completed'
DROP POLICY IF EXISTS "Students can rate their completed sessions" ON public.ratings;
DROP POLICY IF EXISTS "Students can create ratings for their tutors" ON public.ratings;

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
      AND s.status = 'COMPLETED_ASSUMED'
      AND s.scheduled_end_at <= now()
  )
);

-- =============================================================================
-- RPC helpers for pending feedback enforcement
-- =============================================================================

-- Returns the next session_id requiring a student rating for the current auth user (student).
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
    AND s.status = 'COMPLETED_ASSUMED'
    AND s.scheduled_end_at <= now()
    AND r.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

-- Returns the next session_id requiring tutor written feedback for the current auth user (tutor).
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
    AND s.status = 'COMPLETED_ASSUMED'
    AND s.scheduled_end_at <= now()
    AND tf.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_tutor_feedback_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_tutor_feedback_session() TO authenticated;

