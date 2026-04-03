-- =====================================================
-- COMMUNITY MESSAGE REACTIONS (one emoji per user per message)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.community_message_reactions_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_reactions_v2_unique UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_message_reactions_v2_message ON public.community_message_reactions_v2(message_id);

ALTER TABLE public.community_message_reactions_v2 ENABLE ROW LEVEL SECURITY;

-- SELECT: users who can read the community can read reactions
CREATE POLICY "community_message_reactions_v2_select"
ON public.community_message_reactions_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_messages_v2 m
    JOIN public.community_memberships_v2 mem ON mem.community_id = m.community_id AND mem.user_id = auth.uid() AND mem.status = 'ACTIVE'
    WHERE m.id = community_message_reactions_v2.message_id
  )
);

-- INSERT: ACTIVE community members only, own user_id
CREATE POLICY "community_message_reactions_v2_insert"
ON public.community_message_reactions_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_messages_v2 m
    JOIN public.community_memberships_v2 mem ON mem.community_id = m.community_id AND mem.user_id = auth.uid() AND mem.status = 'ACTIVE'
    WHERE m.id = message_id
  )
);

-- UPDATE/DELETE: own reaction only
CREATE POLICY "community_message_reactions_v2_update"
ON public.community_message_reactions_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_message_reactions_v2_delete"
ON public.community_message_reactions_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

COMMENT ON TABLE public.community_message_reactions_v2 IS 'Per-message emoji reactions; one per user per message';
