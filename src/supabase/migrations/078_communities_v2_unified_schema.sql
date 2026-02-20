-- =====================================================
-- COMMUNITIES V2 UNIFIED SCHEMA (Discord-style)
-- communities + community_memberships + community_messages + community_favorites
-- =====================================================

-- 1. ENUMS (distinct names to avoid conflict with existing community_type/member_role/member_status)
DO $$ BEGIN
  CREATE TYPE v2_community_type AS ENUM ('SCHOOL', 'PUBLIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE v2_community_member_role AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE v2_community_member_status AS ENUM ('ACTIVE', 'LEFT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. COMMUNITIES
CREATE TABLE IF NOT EXISTS public.communities_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type v2_community_type NOT NULL,
  school_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_v2_school_unique UNIQUE (school_id),
  CONSTRAINT communities_v2_school_has_id CHECK (
    (type = 'SCHOOL' AND school_id IS NOT NULL) OR (type = 'PUBLIC' AND school_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_communities_v2_type ON public.communities_v2(type);
CREATE INDEX IF NOT EXISTS idx_communities_v2_school_id ON public.communities_v2(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communities_v2_created_by ON public.communities_v2(created_by);

COMMENT ON TABLE public.communities_v2 IS 'Unified communities: SCHOOL (one per institution) and PUBLIC (user-created)';

-- 3. COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS public.community_memberships_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role v2_community_member_role NOT NULL DEFAULT 'MEMBER',
  status v2_community_member_status NOT NULL DEFAULT 'ACTIVE',
  muted boolean NOT NULL DEFAULT false,
  muted_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT community_memberships_v2_unique UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_community_user ON public.community_memberships_v2(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_user ON public.community_memberships_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_status ON public.community_memberships_v2(status);

COMMENT ON TABLE public.community_memberships_v2 IS 'Memberships for v2 communities; muted_until for timed mute';

-- 4. COMMUNITY_MESSAGES
CREATE TABLE IF NOT EXISTS public.community_messages_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_messages_v2_community_created ON public.community_messages_v2(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_v2_parent ON public.community_messages_v2(parent_message_id) WHERE parent_message_id IS NOT NULL;

COMMENT ON TABLE public.community_messages_v2 IS 'Messages and threads for v2 communities';

-- 5. COMMUNITY_FAVORITES (per-user bookmarks)
CREATE TABLE IF NOT EXISTS public.community_favorites_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_favorites_v2_unique UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_community_favorites_v2_user ON public.community_favorites_v2(user_id);

COMMENT ON TABLE public.community_favorites_v2 IS 'Per-user favorite (bookmark) messages in v2 communities';
