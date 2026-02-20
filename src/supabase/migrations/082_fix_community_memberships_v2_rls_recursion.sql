-- =====================================================
-- FIX: Infinite recursion in policy for community_memberships_v2
-- =====================================================
-- Two policies formed a cycle:
--   community_memberships_v2_select → reads communities_v2
--   communities_v2_select → reads community_memberships_v2 → recursion.
--
-- Fix both: no policy may read community_memberships_v2 when evaluating
-- visibility. Communities: visible if PUBLIC or user's school.
-- Memberships: visible if own row, or community is PUBLIC/school.
-- =====================================================

-- 1. communities_v2: remove the clause that reads community_memberships_v2
DROP POLICY IF EXISTS "communities_v2_select" ON public.communities_v2;

CREATE POLICY "communities_v2_select"
ON public.communities_v2 FOR SELECT TO authenticated
USING (
  type = 'PUBLIC'
  OR school_id = public.user_institution_id()
);

-- 2. community_memberships_v2: already fixed in 082 (no self-ref); ensure no cycle
DROP POLICY IF EXISTS "community_memberships_v2_select" ON public.community_memberships_v2;

CREATE POLICY "community_memberships_v2_select"
ON public.community_memberships_v2 FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_memberships_v2.community_id
    AND (c.type = 'PUBLIC' OR c.school_id = public.user_institution_id())
  )
);
