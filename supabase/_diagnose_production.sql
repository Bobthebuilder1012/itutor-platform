-- =====================================================================
-- PRODUCTION SCHEMA DIAGNOSTIC (READ-ONLY)
-- Run this in your PRODUCTION Supabase SQL Editor and share the output.
-- It does NOT modify anything.
-- =====================================================================

-- 1. Which tables exist in the public schema?
SELECT 'TABLES' AS section, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Columns on `profiles` (the table that's been hitting "column not found" errors)
SELECT 'profiles_columns' AS section, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Columns on `subjects`
SELECT 'subjects_columns' AS section, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subjects'
ORDER BY ordinal_position;

-- 4. Installed Postgres extensions
SELECT 'extensions' AS section, extname, extversion
FROM pg_extension
ORDER BY extname;

-- 5. Storage buckets (avatars, verification, etc.)
SELECT 'storage_buckets' AS section, id, name, public
FROM storage.buckets
ORDER BY id;

-- 6. Supabase migrations table - shows what the CLI has officially applied
--    (May not exist if migrations were never run via CLI)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations EXISTS - query it for applied versions.';
  ELSE
    RAISE NOTICE 'supabase_migrations.schema_migrations DOES NOT EXIST - migrations were never tracked by the CLI.';
  END IF;
END $$;

-- If the migrations table exists, this returns applied versions:
SELECT 'applied_migrations' AS section, version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
