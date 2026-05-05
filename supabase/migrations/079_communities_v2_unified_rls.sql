-- =====================================================
-- COMMUNITIES V2 UNIFIED - RLS POLICIES
-- Uses public.user_institution_id() from 077
-- =====================================================

ALTER TABLE public.communities_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_memberships_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_favorites_v2 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- COMMUNITIES_V2
-- ---------------------------------------------------------------------------
-- SELECT: ACTIVE member OR PUBLIC (browse) OR SCHOOL and user's school
CREATE POLICY "communities_v2_select"
ON public.communities_v2 FOR SELECT TO authenticated
USING (
  type = 'PUBLIC'
  OR school_id = public.user_institution_id()
  OR EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = communities_v2.id AND m.user_id = auth.uid() AND m.status = 'ACTIVE'
  )
);

-- INSERT: PUBLIC by anyone (creator); SCHOOL only via service role
CREATE POLICY "communities_v2_insert_public"
ON public.communities_v2 FOR INSERT TO authenticated
WITH CHECK (type = 'PUBLIC' AND created_by = auth.uid());

-- UPDATE: creator only (avatar, name, description)
CREATE POLICY "communities_v2_update_creator"
ON public.communities_v2 FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_MEMBERSHIPS_V2
-- ---------------------------------------------------------------------------
-- SELECT: memberships for communities user can read
CREATE POLICY "community_memberships_v2_select"
ON public.community_memberships_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_memberships_v2.community_id
    AND (
      c.type = 'PUBLIC'
      OR c.school_id = public.user_institution_id()
      OR EXISTS (SELECT 1 FROM public.community_memberships_v2 m2 WHERE m2.community_id = c.id AND m2.user_id = auth.uid())
    )
  )
);

-- INSERT: join PUBLIC or SCHOOL (own school only), self only
CREATE POLICY "community_memberships_v2_insert"
ON public.community_memberships_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.communities_v2 c WHERE c.id = community_id AND c.type = 'PUBLIC')
    OR EXISTS (SELECT 1 FROM public.communities_v2 c WHERE c.id = community_id AND c.type = 'SCHOOL' AND c.school_id = public.user_institution_id())
  )
);

-- UPDATE: own row only (status, muted, muted_until, left_at)
CREATE POLICY "community_memberships_v2_update_own"
ON public.community_memberships_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_MESSAGES_V2
-- ---------------------------------------------------------------------------
-- SELECT: ACTIVE member or SCHOOL-eligible (same school)
CREATE POLICY "community_messages_v2_select"
ON public.community_messages_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_messages_v2.community_id
    AND (
      (c.type = 'SCHOOL' AND c.school_id = public.user_institution_id())
      OR EXISTS (SELECT 1 FROM public.community_memberships_v2 m WHERE m.community_id = c.id AND m.user_id = auth.uid() AND m.status = 'ACTIVE')
    )
  )
);

-- INSERT: ACTIVE member only
CREATE POLICY "community_messages_v2_insert"
ON public.community_messages_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = community_messages_v2.community_id AND m.user_id = auth.uid() AND m.status = 'ACTIVE'
  )
);

-- UPDATE: own content; is_pinned only for ADMIN
CREATE POLICY "community_messages_v2_update_own"
ON public.community_messages_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_messages_v2_update_pin_admin"
ON public.community_messages_v2 FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = community_messages_v2.community_id AND m.user_id = auth.uid() AND m.role = 'ADMIN'
  )
)
WITH CHECK (true);

-- DELETE: own messages only
CREATE POLICY "community_messages_v2_delete_own"
ON public.community_messages_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_FAVORITES_V2
-- ---------------------------------------------------------------------------
CREATE POLICY "community_favorites_v2_select"
ON public.community_favorites_v2 FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "community_favorites_v2_insert"
ON public.community_favorites_v2 FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_favorites_v2_delete"
ON public.community_favorites_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- STORAGE: community-avatars (path: {community_id}/{filename})
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-avatars', 'community-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "community_avatars_select" ON storage.objects;
CREATE POLICY "community_avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'community-avatars');

DROP POLICY IF EXISTS "community_avatars_insert" ON storage.objects;
CREATE POLICY "community_avatars_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "community_avatars_update" ON storage.objects;
CREATE POLICY "community_avatars_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "community_avatars_delete" ON storage.objects;
CREATE POLICY "community_avatars_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);
