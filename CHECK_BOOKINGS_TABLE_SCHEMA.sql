-- =====================================================
-- CHECK BOOKINGS TABLE SCHEMA
-- Diagnose the constraint violation issue
-- =====================================================

-- 1. Check current column order in bookings table
SELECT 
    ordinal_position,
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'bookings'
ORDER BY ordinal_position;

-- 2. Check current constraint definition
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
INNER JOIN pg_class rel ON rel.oid = con.conrelid
INNER JOIN pg_namespace nsp ON nsp.oid = connamespace
WHERE nsp.nspname = 'public'
    AND rel.relname = 'bookings'
    AND con.conname = 'bookings_status_check';

-- 3. Check if there are any triggers that might be causing issues
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
    AND event_object_table = 'bookings'
ORDER BY trigger_name;
