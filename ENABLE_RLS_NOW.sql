-- Force enable RLS on all tables
BEGIN;

ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify it worked
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('messages', 'conversations', 'profiles', 'community_memberships')
ORDER BY tablename;

DO $$
BEGIN
  RAISE NOTICE '✅ RLS has been enabled on all tables';
  RAISE NOTICE 'All tables should now show rls_enabled = true';
END $$;
