-- =====================================================
-- ADD BIO/DESCRIPTION FIELD TO PROFILES
-- =====================================================

-- Add bio column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'bio'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN bio text;
        
        RAISE NOTICE '✓ Added bio column to profiles table';
    ELSE
        RAISE NOTICE '✓ Bio column already exists in profiles table';
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('bio', 'subjects_of_study', 'full_name', 'username', 'display_name')
ORDER BY ordinal_position;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  BIO FIELD SETUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Students/tutors can now add a bio/description';
    RAISE NOTICE '';
    RAISE NOTICE 'Students can add their bio in Settings';
    RAISE NOTICE 'Tutors can view student bios on student profile pages';
    RAISE NOTICE '';
END $$;














