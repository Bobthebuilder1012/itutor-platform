-- =====================================================
-- ADD BIOGRAPHY COLUMN TO PROFILES TABLE
-- =====================================================
-- Migration: 017
-- Description: Adds a 'bio' column to store user biographies
-- Run this in your Supabase SQL Editor

-- Add bio column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN public.profiles.bio IS 'User biography/about me text, supports emojis and multiline content (max ~1000 chars recommended)';

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'bio';

SELECT 'Biography column added successfully!' AS status;







