-- =====================================================
-- CHECK EXISTING RLS POLICIES ON BOOKINGS TABLE
-- =====================================================

-- Show all current policies on bookings table
SELECT 
    schemaname AS schema,
    tablename AS table,
    policyname AS policy_name,
    permissive,
    roles,
    cmd AS command,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies 
WHERE tablename = 'bookings'
ORDER BY policyname;












