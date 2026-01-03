-- =====================================================
-- COMMUNITIES CORE TABLES
-- =====================================================
-- Creates the foundation for school communities and subject Q&A communities

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE community_type AS ENUM ('school', 'school_form', 'subject_qa');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_audience AS ENUM ('students', 'itutors', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('member', 'moderator', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'restricted', 'timed_out', 'banned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE COMMUNITIES TABLE
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type community_type NOT NULL,
  audience community_audience NOT NULL DEFAULT 'students',
  
  -- For school and school_form types
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  form_level text, -- e.g., "Form 1", "Form 2", "Lower 6", "Upper 6"
  
  -- For subject_qa types
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  level_tag text, -- e.g., "Form 4", "CSEC", "CAPE Unit 1"
  
  -- Community metadata
  is_auto boolean NOT NULL DEFAULT false, -- true for school/form communities
  is_joinable boolean NOT NULL DEFAULT true, -- false for school/form (auto-assigned only)
  description text,
  image_url text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT school_has_institution CHECK (
    type IN ('school', 'school_form') AND institution_id IS NOT NULL
    OR type = 'subject_qa'
  ),
  CONSTRAINT subject_qa_has_subject CHECK (
    type = 'subject_qa' AND subject_id IS NOT NULL
    OR type IN ('school', 'school_form')
  ),
  CONSTRAINT unique_school_community UNIQUE (type, institution_id, form_level),
  CONSTRAINT unique_subject_community UNIQUE (type, subject_id, level_tag)
);

-- 3. CREATE INDEXES FOR COMMUNITIES
CREATE INDEX IF NOT EXISTS idx_communities_type ON communities(type);
CREATE INDEX IF NOT EXISTS idx_communities_type_institution ON communities(type, institution_id);
CREATE INDEX IF NOT EXISTS idx_communities_type_subject_level ON communities(type, subject_id, level_tag);
CREATE INDEX IF NOT EXISTS idx_communities_is_joinable ON communities(is_joinable) WHERE is_joinable = true;
CREATE INDEX IF NOT EXISTS idx_communities_audience ON communities(audience);

-- 4. CREATE COMMUNITY_MEMBERSHIPS TABLE
CREATE TABLE IF NOT EXISTS community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  status member_status NOT NULL DEFAULT 'active',
  timed_out_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate memberships
  CONSTRAINT unique_community_member UNIQUE (community_id, user_id)
);

-- 5. CREATE INDEXES FOR MEMBERSHIPS
CREATE INDEX IF NOT EXISTS idx_memberships_user ON community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_community ON community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON community_memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON community_memberships(role) WHERE role IN ('moderator', 'admin');

-- 6. CREATE TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_communities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER communities_updated_at
  BEFORE UPDATE ON communities
  FOR EACH ROW
  EXECUTE FUNCTION update_communities_updated_at();

-- 7. ENABLE RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;

-- 8. COMMENTS
COMMENT ON TABLE communities IS 'Communities for schools, forms, and subject Q&A';
COMMENT ON TABLE community_memberships IS 'User memberships in communities with roles and status';
COMMENT ON COLUMN communities.is_auto IS 'True for school/form communities that are auto-assigned';
COMMENT ON COLUMN communities.is_joinable IS 'False for school/form communities, true for subject Q&A';
COMMENT ON COLUMN community_memberships.status IS 'User status: active, restricted (read-only), timed_out, or banned';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Communities core tables created successfully';
  RAISE NOTICE '   - communities table with type, audience, and metadata';
  RAISE NOTICE '   - community_memberships table with roles and status';
  RAISE NOTICE '   - Comprehensive indexes for performance';
  RAISE NOTICE '   - RLS enabled (policies in separate migration)';
END $$;





