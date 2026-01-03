-- =====================================================
-- ADD AVATAR_URL TO PROFILES
-- Stores the public URL to user's profile picture
-- =====================================================

-- Add avatar_url column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url 
ON public.profiles(avatar_url);

-- Add comment
COMMENT ON COLUMN public.profiles.avatar_url IS 'Public URL to user profile picture stored in Supabase Storage';









