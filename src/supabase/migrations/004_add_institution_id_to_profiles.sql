-- =====================================================
-- ADD INSTITUTION_ID TO PROFILES
-- Links profiles to institutions table
-- =====================================================

-- Add institution_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS institution_id uuid 
REFERENCES public.institutions(id) 
ON DELETE SET NULL;

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id 
ON public.profiles(institution_id);

-- Add comment
COMMENT ON COLUMN public.profiles.institution_id IS 'Reference to the institution (school/college) the user is associated with';









