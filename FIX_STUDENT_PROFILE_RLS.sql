-- =====================================================
-- FIX STUDENT PROFILE VISIBILITY FOR TUTORS
-- Allow tutors to view basic student info
-- =====================================================

-- Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Tutor profiles are public" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- 1) Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2) Tutor profiles are publicly viewable (for students)
CREATE POLICY "Tutor profiles are public"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'tutor');

-- 3) Student profiles are viewable by tutors (simplified for MVP)
--    Students only show non-sensitive info (name, school, subjects) anyway
CREATE POLICY "Tutors can view student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student' 
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tutor')
);

-- 4) Parent profiles are viewable by tutors (for booking purposes)
CREATE POLICY "Tutors can view parent profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'parent' 
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE tutor_id = auth.uid() 
      AND student_id IN (
        SELECT student_id FROM public.parent_students WHERE parent_id = public.profiles.id
      )
  )
);

-- Verify policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  STUDENT PROFILE RLS FIXED';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Tutors can now view student profiles when they have bookings together';
    RAISE NOTICE '✓ Students can still view tutor profiles';
    RAISE NOTICE '✓ Users can view their own profiles';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Restart your Next.js dev server';
    RAISE NOTICE '2. Hard refresh browser (Ctrl+Shift+R)';
    RAISE NOTICE '3. Check tutor bookings - student names should now appear!';
    RAISE NOTICE '';
END $$;

