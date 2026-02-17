-- =====================================================
-- NUCLEAR OPTION: Completely disable RLS for development
-- =====================================================
-- This removes ALL security temporarily to get messages working
-- We'll create proper policies in a migration later

BEGIN;

-- Disable RLS on all problematic tables
ALTER TABLE community_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename IN ('community_memberships', 'profiles', 'conversations', 'messages')
ORDER BY tablename;

COMMIT;

-- Restart the pooler to clear cached policies
-- In Supabase Dashboard: Settings -> Database -> Connection Pooler -> Restart

DO $$
BEGIN
  RAISE NOTICE '⚠️  RLS DISABLED on all tables';
  RAISE NOTICE '   This is for LOCAL DEVELOPMENT only';
  RAISE NOTICE '   DO NOT use in production';
  RAISE NOTICE '';
  RAISE NOTICE '   After this:';
  RAISE NOTICE '   1. Restart your dev server';
  RAISE NOTICE '   2. Hard refresh browser';
  RAISE NOTICE '   3. Messages should work';
END $$;
