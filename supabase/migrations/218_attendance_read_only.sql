-- =====================================================
-- MIGRATION 218: ATTENDANCE IS READ-ONLY FOR EVERY USER ROLE
-- =====================================================
-- Handover §2.2, verified against LIVE policy state:
--
--   "student manages own attendance"  FOR ALL  TO authenticated
--     USING (student_id = auth.uid())  WITH CHECK (student_id = auth.uid())
--
-- FOR ALL includes INSERT. So a student can POST their own attendance row
-- straight at PostgREST and be Present for any occurrence id they can name,
-- without ever clicking Join. This is a different and worse problem than
-- "does a join click prove presence" -- there is no click at all.
--
-- It matters more than it looks because absence is INFERRED (mig 196): a row
-- means attended, no row by session end means absent. So a single forged INSERT
-- converts an absence into an attendance, and attendance is about to be shown
-- to parents (decision 16/17: automatic, editable by nobody) and used as the
-- denominator in every rate the product prints.
--
-- AFTER THIS MIGRATION
--   students, parents, tutors  SELECT only
--   nobody                     INSERT / UPDATE / DELETE
--   service role               writes, from the join endpoint only
--
-- Both existing writers already use the service client, so nothing breaks:
--   app/api/attendance/mark-present/route.ts                     getServiceClient()
--   app/api/groups/[groupId]/sessions/.../join-link/route.ts     getServiceClient()
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- Tutor visibility helper
-- ---------------------------------------------------------------
-- SECURITY DEFINER on purpose, and for the opposite reason to migration 217.
-- 217 needed INVOKER so a guard could see who was really calling. Here we need
-- DEFINER so the lookup does NOT re-enter RLS: group_sessions' SELECT policy
-- subqueries group_members, whose own policy references group_members, and
-- Postgres aborts the whole statement with 42P17 "infinite recursion detected
-- in policy for relation group_members". A policy that touched those tables
-- directly would take every attendance read down with it.
CREATE OR REPLACE FUNCTION public.tutor_owns_attendance_occurrence(
  p_occurrence_type text,
  p_occurrence_id   uuid,
  p_tutor_id        uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_tutor_id IS NULL OR p_occurrence_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_occurrence_type = 'session' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = p_occurrence_id AND s.tutor_id = p_tutor_id
    );
  END IF;

  IF p_occurrence_type = 'group_occurrence' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.group_session_occurrences o
      JOIN public.group_sessions gs ON gs.id = o.group_session_id
      JOIN public.groups g          ON g.id  = gs.group_id
      WHERE o.id = p_occurrence_id AND g.tutor_id = p_tutor_id
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_owns_attendance_occurrence(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tutor_owns_attendance_occurrence(text, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------
-- Replace the writable policy with read-only ones
-- ---------------------------------------------------------------
ALTER TABLE public.session_attendance_log ENABLE ROW LEVEL SECURITY;

-- The vulnerable one.
DROP POLICY IF EXISTS "student manages own attendance" ON public.session_attendance_log;

DROP POLICY IF EXISTS "student reads own attendance" ON public.session_attendance_log;
CREATE POLICY "student reads own attendance" ON public.session_attendance_log
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Unchanged in effect, restated so this file is the whole picture.
DROP POLICY IF EXISTS "parent reads child attendance" ON public.session_attendance_log;
CREATE POLICY "parent reads child attendance" ON public.session_attendance_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parent_child_links l
    WHERE l.parent_id = auth.uid()
      AND l.child_id = session_attendance_log.student_id
  ));

-- Decision 17: students and tutors both read attendance, neither writes it.
DROP POLICY IF EXISTS "tutor reads own class attendance" ON public.session_attendance_log;
CREATE POLICY "tutor reads own class attendance" ON public.session_attendance_log
  FOR SELECT TO authenticated
  USING (public.tutor_owns_attendance_occurrence(
    occurrence_type, occurrence_id, auth.uid()
  ));

-- No INSERT, UPDATE or DELETE policy is created, for any role. With RLS on,
-- absence of a policy is a denial -- the service role bypasses RLS entirely and
-- remains the only writer.

-- ---------------------------------------------------------------
-- Belt and braces at the grant level
-- ---------------------------------------------------------------
-- Supabase grants table DML to `authenticated` wholesale, and RLS is the only
-- thing standing in the way. Revoking the write grants means that if someone
-- later re-adds a permissive policy (which is how this hole appeared in the
-- first place -- FOR ALL where FOR SELECT was meant), it still cannot write.
-- If you are here because an INSERT is failing with "permission denied for
-- table session_attendance_log": that is deliberate. Write it with the service
-- client from the join endpoint.
REVOKE INSERT, UPDATE, DELETE ON public.session_attendance_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_attendance_log FROM anon;

COMMIT;
