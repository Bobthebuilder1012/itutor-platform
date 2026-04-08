-- =====================================================
-- GROUP ANNOUNCEMENTS
-- Tutor-only broadcast channel per group.
-- Students can view only. Tutors can post/edit/pin/delete.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.group_announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) > 0),
  is_pinned    boolean NOT NULL DEFAULT false,
  edited_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_announcements_group_id
  ON public.group_announcements(group_id, created_at DESC);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.group_announcements ENABLE ROW LEVEL SECURITY;

-- Approved members (and the tutor) can read announcements
CREATE POLICY "group_announcements_select" ON public.group_announcements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- Only the group's tutor can insert
CREATE POLICY "group_announcements_insert" ON public.group_announcements
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
  );

-- Only the author (tutor) can update
CREATE POLICY "group_announcements_update" ON public.group_announcements
  FOR UPDATE USING (author_id = auth.uid());

-- Only the author (tutor) can delete
CREATE POLICY "group_announcements_delete" ON public.group_announcements
  FOR DELETE USING (author_id = auth.uid());
