-- Quick verification that RLS is enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('messages', 'conversations', 'profiles', 'community_memberships')
ORDER BY tablename;
