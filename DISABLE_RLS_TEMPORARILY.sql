-- =====================================================
-- TEMPORARY FIX: Disable RLS on messages for testing
-- =====================================================
-- WARNING: This removes security! Only for local development testing.
-- DO NOT run this in production!

-- Disable RLS on messages table
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'messages';

-- Expected: rowsecurity = false

-- To re-enable later:
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
