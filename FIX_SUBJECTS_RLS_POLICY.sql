-- =====================================================
-- FIX SUBJECTS TABLE RLS POLICY
-- =====================================================
-- This ensures all users can READ from subjects table
-- (Required for tutor onboarding to fetch subjects)

BEGIN;

-- Enable RLS on subjects table if not already enabled
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Drop any existing SELECT policies (including v2 if it exists)
DROP POLICY IF EXISTS "Anyone can read subjects" ON public.subjects;
DROP POLICY IF EXISTS "Public read access to subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
DROP POLICY IF EXISTS "subjects_public_read_v2" ON public.subjects;
DROP POLICY IF EXISTS "Allow public read access to subjects" ON public.subjects;

-- Create a simple, permissive SELECT policy
-- This allows everyone (authenticated and anonymous) to read subjects
CREATE POLICY "subjects_public_read_v2"
ON public.subjects FOR SELECT
USING (true);

-- Verify the policy was created
SELECT 
  'Policy Created' as status,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'subjects'
  AND cmd = 'SELECT';

COMMIT;

-- Test query (should return results now)
SELECT 
  'Test Query' as test,
  COUNT(*) as total_subjects
FROM subjects;

-- =====================================================
-- After running this, refresh the tutor onboarding page
-- and try selecting subjects again. Should work now!
-- =====================================================

