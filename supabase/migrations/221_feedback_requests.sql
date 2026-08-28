-- =====================================================
-- MIGRATION 221: FEEDBACK REQUESTS (§8.1, §10.3)
-- =====================================================
-- Feedback is optional and PULL-based (statement 5). This table is the pull.
--
-- WHAT ALREADY EXISTS AND IS NOT TOUCHED
--   tutor_feedback            session-scoped free text, the old 1:1 feedback
--   group_feedback_periods    period-based group feedback, with due_at
--   group_feedback_entries    three ratings + comment, with a deadline
--   group_feedback_settings   deadline_days, notify_students
--
-- The group system is built on deadlines, which the new model explicitly
-- rejects: "No deadline, no expiry, no reminder, no escalation" (§8.1). Whether
-- the two remain distinct kinds is §12.3, still open — so nothing above is
-- migrated or dropped here. This is a new, additive mechanism alongside them.
--
-- THE QUOTA IS SHARED, AND THAT IS THE POINT
-- Decision 13: one request per calendar month per tutor-child pair, shared
-- between parent and student. A household cannot double-request. The unique
-- constraint on (child, tutor, period_month) is what enforces it — not
-- application logic, because two well-meaning people clicking at the same time
-- is exactly the race that produces two requests.
--
-- A new month's request SUPERSEDES an unanswered older one rather than stacking
-- (§8.1), so a tutor who has been slow never faces a queue of six identical
-- asks — which would read as nagging from a feature that is explicitly not
-- allowed to nag.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Who spent the shared quota. The other party has to be able to see this:
  -- §9.2 requires the student's Request button to be disabled "with a plain
  -- reason when the shared quota is used, naming who used it".
  requester_role      text NOT NULL CHECK (requester_role IN ('parent', 'student')),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  -- First day of the calendar month, so the unique constraint below is a
  -- per-month constraint without needing a generated expression.
  period_month        date NOT NULL,
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'answered', 'superseded')),
  -- Set when a tutor answers. FK is added in migration 222, once the feedback
  -- table it points at exists.
  answered_feedback_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_request_not_self CHECK (child_id <> tutor_id)
);

-- Decision 13, enforced in the database: the shared monthly quota.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_request_month_quota
  ON public.feedback_requests (child_id, tutor_id, period_month);

-- §8.1: "One open request per tutor-child pair." Belt and braces alongside the
-- supersede logic — if superseding ever fails halfway, this refuses the second
-- open row rather than letting two accumulate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_request_one_open
  ON public.feedback_requests (child_id, tutor_id)
  WHERE status = 'open';

-- The tutor's own queue: the only place a request is actionable.
CREATE INDEX IF NOT EXISTS idx_feedback_requests_tutor_open
  ON public.feedback_requests (tutor_id, requested_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_feedback_requests_child
  ON public.feedback_requests (child_id, period_month DESC);

ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

-- The tutor sees requests addressed to them. §8.1: notification on request goes
-- to the tutor only, and "this is the entire mechanism; nothing else ever
-- prompts a tutor" — so this read is how they find it after that one nudge.
DROP POLICY IF EXISTS "tutor reads requests addressed to them" ON public.feedback_requests;
CREATE POLICY "tutor reads requests addressed to them" ON public.feedback_requests
  FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

-- The student sees their own, including one their parent spent.
DROP POLICY IF EXISTS "student reads own feedback requests" ON public.feedback_requests;
CREATE POLICY "student reads own feedback requests" ON public.feedback_requests
  FOR SELECT TO authenticated
  USING (child_id = auth.uid());

DROP POLICY IF EXISTS "parent reads child feedback requests" ON public.feedback_requests;
CREATE POLICY "parent reads child feedback requests" ON public.feedback_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parent_child_links l
    WHERE l.parent_id = auth.uid() AND l.child_id = feedback_requests.child_id
  ));

-- Writes go through the request endpoint with the service role. Superseding an
-- older row and inserting the new one has to happen together, and a client-side
-- INSERT could do the second without the first — leaving two open requests and
-- a tutor being nagged, which §8.1 forbids.
REVOKE INSERT, UPDATE, DELETE ON public.feedback_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.feedback_requests FROM anon;

COMMIT;
