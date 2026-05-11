-- Add teaching_levels column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teaching_levels text[] DEFAULT NULL;
