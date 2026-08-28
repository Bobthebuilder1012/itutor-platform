-- =====================================================
-- MIGRATION 225: PARENT READ ACCESS TO A CHILD'S TUTOR THREADS (§9.4, §10.8)
-- =====================================================
-- §10.8: "No new table. The parent reads the student-tutor thread through a
-- policy scoped to parent_child_links, filtered to messages after the link's
-- created_at. Read-only. No parent INSERT path on that thread under any
-- circumstance."
--
-- THREE BOUNDARIES, EACH LOAD-BEARING
--
-- 1. TUTOR THREADS ONLY. Decision 23 grants "read-only child message history",
--    and every surface in the design kit shows it as the child-tutor thread.
--    This policy therefore requires the OTHER participant to be a tutor. A
--    parent cannot read their child's conversations with other students. That is
--    a deliberate narrowing: the justification for a parent reading a minor's
--    messages at all is oversight of the adult teaching them, and it does not
--    extend to the child's conversations with their peers.
--
-- 2. FROM THE LINK DATE FORWARD. Messages predating the link stay private,
--    permanently. A student who had a thread before a parent joined the platform
--    did not consent to that history being read, and the invite they accepted
--    (mig 194) cannot retroactively cover it.
--
-- 3. READ ONLY, AND STRUCTURALLY SO. No INSERT or UPDATE policy is added for a
--    parent, and none may be: decision 24 keeps the two threads separate, and a
--    parent able to post into their child's tutor thread could impersonate the
--    child to the tutor. The existing INSERT policies are participant-scoped, so
--    a parent already fails them; this migration does nothing that would change
--    that.
--
-- THE DISCLOSURE IS PART OF THE FEATURE, NOT DECORATION
-- §9.4 is explicit that the child must see a persistent, non-dismissible notice
-- that a linked parent can read the thread, and that the parent is told the child
-- knows. Covert monitoring of a minor is indefensible regardless of intent, and
-- the product's safeguarding position rests on the monitoring being open. The UI
-- half of that ships with this migration; if it is ever removed, this access
-- should be removed with it.
-- =====================================================

BEGIN;

-- SECURITY DEFINER: the check reads profiles.role (to establish the counterpart
-- is a tutor) and parent_child_links, and doing that inline inside a policy on
-- `conversations` would re-enter RLS on those tables. Kept to a single boolean so
-- it cannot be used to read anything.
CREATE OR REPLACE FUNCTION public.parent_may_read_conversation(
  p_conversation_id uuid,
  p_parent_id       uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF p_parent_id IS NULL OR p_conversation_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.parent_child_links l
      ON l.parent_id = p_parent_id
     AND l.child_id IN (c.participant_1_id, c.participant_2_id)
    -- The counterpart must be a tutor: boundary 1 above.
    JOIN public.profiles other
      ON other.id = CASE
                      WHEN c.participant_1_id = l.child_id THEN c.participant_2_id
                      ELSE c.participant_1_id
                    END
    WHERE c.id = p_conversation_id
      AND other.role = 'tutor'
  ) INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.parent_may_read_conversation(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.parent_may_read_conversation(uuid, uuid) TO authenticated;

-- When the link began. Boundary 2: anything older than this is not visible.
CREATE OR REPLACE FUNCTION public.parent_link_started_at(
  p_parent_id uuid,
  p_child_id  uuid
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT min(created_at)
  FROM public.parent_child_links
  WHERE parent_id = p_parent_id AND child_id = p_child_id;
$$;

REVOKE ALL ON FUNCTION public.parent_link_started_at(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.parent_link_started_at(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------
-- The two read policies. Additive: the existing participant policies stay.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "parent reads child tutor conversations" ON public.conversations;
CREATE POLICY "parent reads child tutor conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.parent_may_read_conversation(id, auth.uid()));

DROP POLICY IF EXISTS "parent reads child tutor messages" ON public.messages;
CREATE POLICY "parent reads child tutor messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.parent_may_read_conversation(conversation_id, auth.uid())
    AND created_at >= COALESCE(
      (
        -- The link date for whichever participant is this parent's child.
        SELECT public.parent_link_started_at(auth.uid(), l.child_id)
        FROM public.parent_child_links l
        JOIN public.conversations c ON c.id = messages.conversation_id
        WHERE l.parent_id = auth.uid()
          AND l.child_id IN (c.participant_1_id, c.participant_2_id)
        LIMIT 1
      ),
      -- No link resolved: show nothing rather than everything. A missing bound
      -- must fail closed, or the filter silently becomes no filter.
      'infinity'::timestamptz
    )
  );

-- Deliberately absent: any parent INSERT, UPDATE or DELETE policy on either
-- table. See boundary 3. If a future change appears to need one, it does not —
-- the parent has their own thread with the tutor (decision 24).

COMMIT;
