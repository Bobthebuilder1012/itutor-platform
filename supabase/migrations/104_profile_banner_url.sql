-- Optional hero banner for tutor discovery cards and profile headers
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_banner_url text;

COMMENT ON COLUMN public.profiles.profile_banner_url IS 'Public URL for profile/tutor card banner image (Supabase Storage or external CDN)';
