-- =====================================================
-- ENABLE RLS ON PROFILES AND SUBJECTS TABLES
-- =====================================================
-- Security fix: Ensure RLS is enabled on these tables
-- as required by the existing RLS policies

BEGIN;

-- Enable RLS on profiles table
-- This table has comprehensive policies defined in previous migrations
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on subjects table
-- This table allows public read but only admin writes
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS not enabled on profiles table';
  END IF;
  
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'subjects' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS not enabled on subjects table';
  END IF;
  
  RAISE NOTICE 'RLS successfully enabled on profiles and subjects tables';
END $$;

