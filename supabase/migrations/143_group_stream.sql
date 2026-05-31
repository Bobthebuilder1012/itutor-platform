-- =====================================================
-- GROUP STREAMS (Google Classroom-style)
-- Posts and threaded replies per group. Tutors post;
-- students view and reply.
-- =====================================================

-- ============================
-- TABLE: stream_posts
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('tutor', 'student')),
  post_type text NOT NULL CHECK (post_type IN ('announcement', 'content', 'discussion')),
  message_body text NOT NULL CHECK (char_length(trim(message_body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_posts_group_id ON public.stream_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_stream_posts_created_at ON public.stream_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_posts_group_created ON public.stream_posts(group_id, created_at DESC);

ALTER TABLE public.stream_posts ENABLE ROW LEVEL SECURITY;

-- SELECT: tutor or approved member of the group
CREATE POLICY "stream_posts_select" ON public.stream_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = stream_posts.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- INSERT: tutor can post any type; student can post discussion only
CREATE POLICY "stream_posts_insert" ON public.stream_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (author_role = 'tutor' AND post_type IN ('announcement', 'content', 'discussion')
        AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()))
      OR (author_role = 'student' AND post_type = 'discussion'
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = stream_posts.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

-- UPDATE: author can edit own post
CREATE POLICY "stream_posts_update" ON public.stream_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- DELETE: only tutor (group owner) or post author
CREATE POLICY "stream_posts_delete" ON public.stream_posts
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.stream_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stream_posts_updated_at
  BEFORE UPDATE ON public.stream_posts
  FOR EACH ROW EXECUTE FUNCTION public.stream_posts_updated_at();

COMMENT ON TABLE public.stream_posts IS 'Group stream posts (announcements, content, discussion).';

-- ============================
-- TABLE: stream_replies
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.stream_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_body text NOT NULL CHECK (char_length(trim(message_body)) > 0),
  parent_reply_id uuid REFERENCES public.stream_replies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_replies_post_id ON public.stream_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_stream_replies_parent ON public.stream_replies(parent_reply_id) WHERE parent_reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stream_replies_created ON public.stream_replies(created_at);

ALTER TABLE public.stream_replies ENABLE ROW LEVEL SECURITY;

-- SELECT: same as stream_posts (group member or tutor)
CREATE POLICY "stream_replies_select" ON public.stream_replies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND (g.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

-- INSERT: tutor or approved member can reply
CREATE POLICY "stream_replies_insert" ON public.stream_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id
        AND (g.tutor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
          ))
    )
  );

-- UPDATE: author only
CREATE POLICY "stream_replies_update" ON public.stream_replies
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- DELETE: author or group tutor
CREATE POLICY "stream_replies_delete" ON public.stream_replies
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND g.tutor_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.stream_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stream_replies_updated_at
  BEFORE UPDATE ON public.stream_replies
  FOR EACH ROW EXECUTE FUNCTION public.stream_replies_updated_at();

COMMENT ON TABLE public.stream_replies IS 'Threaded replies to stream posts; supports nested replies via parent_reply_id.';

-- ============================
-- TABLE: stream_attachments
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.stream_posts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_attachments_post_id ON public.stream_attachments(post_id);

ALTER TABLE public.stream_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_attachments_select" ON public.stream_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND (g.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

CREATE POLICY "stream_attachments_insert" ON public.stream_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "stream_attachments_delete" ON public.stream_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stream_posts p WHERE p.id = post_id AND p.author_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND g.tutor_id = auth.uid()
    )
  );

COMMENT ON TABLE public.stream_attachments IS 'Optional file attachments for stream posts.';
