-- =====================================================
-- GROUPS FEATURE: GROUP SESSIONS, MEMBERS, MESSAGING
-- =====================================================

-- ============================
-- TABLE: groups
-- ============================
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text,
  pricing text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_groups_tutor_id ON public.groups(tutor_id);
CREATE INDEX IF NOT EXISTS idx_groups_archived ON public.groups(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can read non-archived groups
CREATE POLICY "groups_select"
ON public.groups FOR SELECT TO authenticated
USING (archived_at IS NULL);

-- INSERT: only tutors can create groups
CREATE POLICY "groups_insert"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tutor'
  )
);

-- UPDATE: tutor can update their own group
CREATE POLICY "groups_update"
ON public.groups FOR UPDATE TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- DELETE: tutor can delete their own group
CREATE POLICY "groups_delete"
ON public.groups FOR DELETE TO authenticated
USING (tutor_id = auth.uid());

COMMENT ON TABLE public.groups IS 'Group sessions created by tutors for multiple students';


-- ============================
-- TABLE: group_members
-- ============================
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_unique UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON public.group_members(status);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- SELECT: group tutor can see all members; members can see approved peers; user can see own record
CREATE POLICY "group_members_select"
ON public.group_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  )
);

-- INSERT: authenticated users can request to join (students only, one request per group)
CREATE POLICY "group_members_insert"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- UPDATE: tutor can approve/deny; user cannot change their own status
CREATE POLICY "group_members_update"
ON public.group_members FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

-- DELETE: tutor can remove members
CREATE POLICY "group_members_delete"
ON public.group_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_members IS 'Membership requests and approvals for groups';


-- ============================
-- TABLE: group_sessions
-- ============================
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  recurrence_type text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'weekly', 'daily')),
  recurrence_days integer[] DEFAULT '{}',
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_sessions_group_id ON public.group_sessions(group_id);

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: approved members and tutor can view sessions
CREATE POLICY "group_sessions_select"
ON public.group_sessions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_sessions.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

-- INSERT/UPDATE/DELETE: tutor only
CREATE POLICY "group_sessions_insert"
ON public.group_sessions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_sessions_update"
ON public.group_sessions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_sessions_delete"
ON public.group_sessions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_sessions IS 'Session definitions (possibly recurring) for a group';


-- ============================
-- TABLE: group_session_occurrences
-- ============================
CREATE TABLE IF NOT EXISTS public.group_session_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_session_id uuid NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'cancelled')),
  cancelled_at timestamptz,
  cancellation_note text
);

CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_session_id ON public.group_session_occurrences(group_session_id);
CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_start ON public.group_session_occurrences(scheduled_start_at);

ALTER TABLE public.group_session_occurrences ENABLE ROW LEVEL SECURITY;

-- SELECT: approved members and tutor via parent session
CREATE POLICY "group_session_occurrences_select"
ON public.group_session_occurrences FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.group_members gm ON gm.group_id = gs.group_id
    WHERE gs.id = group_session_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

CREATE POLICY "group_session_occurrences_insert"
ON public.group_session_occurrences FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_session_occurrences_update"
ON public.group_session_occurrences FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_session_occurrences_delete"
ON public.group_session_occurrences FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_session_occurrences IS 'Individual occurrences of group sessions';


-- ============================
-- TABLE: group_messages
-- ============================
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES public.group_messages(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_parent ON public.group_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_messages_pinned ON public.group_messages(group_id, is_pinned) WHERE is_pinned = true;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Helper: user is an approved member or the tutor of a group
-- SELECT: approved members and tutor
CREATE POLICY "group_messages_select"
ON public.group_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_messages.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

-- INSERT: approved members and tutor can post; replies only allowed if parent is not locked
CREATE POLICY "group_messages_insert"
ON public.group_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  )
  AND (
    parent_message_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.group_messages pm
      WHERE pm.id = parent_message_id AND pm.is_locked = true
    )
  )
);

-- UPDATE: tutor can pin/lock; sender can edit own non-locked messages
CREATE POLICY "group_messages_update"
ON public.group_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (sender_id = auth.uid() AND is_locked = false)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (sender_id = auth.uid() AND is_locked = false)
);

-- DELETE: tutor or sender
CREATE POLICY "group_messages_delete"
ON public.group_messages FOR DELETE TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_messages IS 'Async message board for group members; supports threaded replies and tutor pin/lock';


-- ============================
-- ALTER: conversations — add group_context_id
-- ============================
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS group_context_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_group_context ON public.conversations(group_context_id) WHERE group_context_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.group_context_id IS 'If set, this 1:1 conversation was initiated from a group page';
