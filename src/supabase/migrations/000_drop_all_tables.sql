-- iTutor Platform - Drop All Tables (USE WITH CAUTION!)
-- Run this ONLY if you want to completely reset and start fresh
-- WARNING: This will delete ALL data in these tables!

-- Drop tables in reverse order (respecting foreign key dependencies)
DROP TABLE IF EXISTS public.payout_requests CASCADE;
DROP TABLE IF EXISTS public.commission_ledger CASCADE;
DROP TABLE IF EXISTS public.tutor_balances CASCADE;
DROP TABLE IF EXISTS public.tutor_earnings CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.ratings CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.tutor_verified_subject_grades CASCADE;
DROP TABLE IF EXISTS public.tutor_verifications CASCADE;
DROP TABLE IF EXISTS public.tutor_subjects CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.parent_child_links CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop helper functions if they exist
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_my_child(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_child_session(uuid) CASCADE;

-- Drop triggers and functions
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_tutor_rating() CASCADE;

-- Confirmation message
DO $$
BEGIN
  RAISE NOTICE 'All iTutor tables, functions, and triggers have been dropped.';
  RAISE NOTICE 'You can now run 001_complete_schema_with_rls.sql for a fresh start.';
END $$;

















