-- =====================================================
-- MIGRATION 222: UNIFIED FEEDBACK (§8.2, §10.4)
-- =====================================================
-- One unified kind of feedback, answering a request (§10.3) or volunteered
-- unprompted. Sits alongside tutor_feedback and group_feedback_entries, which
-- are untouched — §12.3 (monthly versus session feedback) is still open.
--
-- WHY sections IS JSONB
-- §8.2 and §12.2: which free-text sections survive — performance, behaviour,
-- focus next — and whether a star rating stays, is undecided. JSONB means that
-- question can be settled in the UI without a migration, which is exactly what
-- the handover asks for. Attendance and Participation ARE settled, so those get
-- real columns and a real CHECK.
--
-- WHY attendance_snapshot IS STORED AND NOT JOINED
-- §8.2: the attendance block is auto-generated from actual figures and
-- read-only. Storing the figures as they stood when the feedback was written
-- means a report a parent read in March still says what it said in March. A live
-- join would let a later session silently rewrite the past — and a tutor's
-- written note ("the late arrival was a school event") would end up attached to
-- numbers that no longer contain that arrival.
--
-- NO ASSIGNMENT OR HOMEWORK COLUMNS
-- §8.2 is explicit. iTutor tracks neither, so a field asking for it would imply
-- data the product cannot supply. §11 records it as debt, not scope.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One unified kind today; the column exists because §12.3 may split it again.
  kind                text NOT NULL DEFAULT 'general'
                        CHECK (kind IN ('general', 'session', 'monthly')),
  -- Null unless the feedback is about one specific session.
  session_id          uuid,
  child_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Null when volunteered unprompted, which §8 expects to be common.
  request_id          uuid REFERENCES public.feedback_requests(id) ON DELETE SET NULL,

  -- §8.2: generated, read-only, frozen at write time. Shape is
  -- { attended, late, absent, cancelled, excluded, rate, counted, rateLabel }
  -- exactly as lib/server/attendance produces it, so the figures in a report
  -- and the figures on screen come from the same helper (§6).
  attendance_snapshot jsonb,
  -- The optional line for what the numbers miss. The only editable part of the
  -- attendance block.
  attendance_note     text,

  -- §8.2, worded exactly as specified. Stored as the enum values, not as the
  -- display strings, so the wording can change without a data migration.
  participation       text NOT NULL
                        CHECK (participation IN ('yes', 'occasionally', 'not_often', 'never_recall')),

  -- §12.2 is open; keep it schema-free. Array of { key, label, body }.
  sections            jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now(),
  -- §8.2: editable after posting, stamp updated_at, surface "edited". The UI
  -- compares the two to decide whether to show that.
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_not_self CHECK (child_id <> tutor_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_child ON public.feedback (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tutor ON public.feedback (tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_request ON public.feedback (request_id)
  WHERE request_id IS NOT NULL;

-- Now that feedback exists, close the loop from migration 221.
ALTER TABLE public.feedback_requests
  DROP CONSTRAINT IF EXISTS feedback_requests_answered_feedback_id_fkey;
ALTER TABLE public.feedback_requests
  ADD CONSTRAINT feedback_requests_answered_feedback_id_fkey
  FOREIGN KEY (answered_feedback_id) REFERENCES public.feedback(id) ON DELETE SET NULL;

-- updated_at has to move on edit, and cannot be left to the caller: §8.2's
-- "edited" marker is derived from it, so a client that forgot to set it would
-- silently hide the fact that a report changed after a parent read it.
CREATE OR REPLACE FUNCTION public.feedback_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_touch_updated_at ON public.feedback;
CREATE TRIGGER trg_feedback_touch_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.feedback_touch_updated_at();

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- §10.4: authoring tutor INSERT/UPDATE.
DROP POLICY IF EXISTS "tutor writes own feedback" ON public.feedback;
CREATE POLICY "tutor writes own feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (tutor_id = auth.uid());

-- Editable after posting, by its author only, and the author cannot hand it to
-- someone else: tutor_id must still be them after the update.
DROP POLICY IF EXISTS "tutor edits own feedback" ON public.feedback;
CREATE POLICY "tutor edits own feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

DROP POLICY IF EXISTS "tutor reads own feedback" ON public.feedback;
CREATE POLICY "tutor reads own feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

-- §10.4: linked parent and the child READ. Decision 14: feedback reaches both.
DROP POLICY IF EXISTS "child reads own feedback" ON public.feedback;
CREATE POLICY "child reads own feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (child_id = auth.uid());

DROP POLICY IF EXISTS "parent reads child feedback" ON public.feedback;
CREATE POLICY "parent reads child feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parent_child_links l
    WHERE l.parent_id = auth.uid() AND l.child_id = feedback.child_id
  ));

-- Nobody deletes feedback. A parent who read a report and later found it gone
-- has no way to tell whether they misremembered it; withdrawing something said
-- about a child is an edit with an "edited" marker, not a disappearance.
REVOKE DELETE ON public.feedback FROM authenticated;
REVOKE DELETE ON public.feedback FROM anon;

-- The attendance snapshot is generated server-side from the shared helper. A
-- tutor writing their own figures could report a 100% rate for a student who
-- attended twice, and it would look identical to a real one.
CREATE OR REPLACE FUNCTION public.feedback_guard_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.attendance_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_snapshot is generated server-side, not supplied'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.attendance_snapshot IS DISTINCT FROM OLD.attendance_snapshot THEN
    RAISE EXCEPTION 'attendance_snapshot cannot be edited'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_guard_snapshot ON public.feedback;
CREATE TRIGGER trg_feedback_guard_snapshot
  BEFORE INSERT OR UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.feedback_guard_snapshot();

COMMIT;

-- =====================================================
-- Notification types for §8.1
-- =====================================================
-- 'feedback_requested' is the one nudge a tutor ever gets about feedback, and
-- §10.6 names it as its own preference category. 'new_feedback' already exists
-- for the other direction (a report reaching parent and student).
-- Idempotent: re-running is a no-op.
DO $outer$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND rel.relname = 'notifications'
    AND con.conname = 'notifications_type_check';

  IF v_def IS NULL OR v_def LIKE '%feedback_requested%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

  v_def := replace(
    v_def,
    '''seat_unavailable_refunded''::text]',
    '''seat_unavailable_refunded''::text, ''feedback_requested''::text]'
  );

  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check '
       || substring(v_def from position('CHECK' in v_def)) || ' NOT VALID';
END
$outer$;
