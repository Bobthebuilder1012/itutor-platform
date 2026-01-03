-- =====================================================
-- AVATAR STORAGE BUCKET SETUP
-- =====================================================
-- This script creates the storage bucket and policies for avatar uploads
-- Run this in your Supabase SQL Editor

-- 1. Create the avatars storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on the storage.objects table (should already be enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. DROP existing policies (if any) to avoid conflicts
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- 4. CREATE POLICIES

-- Allow public read access to all avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Verify the bucket was created
SELECT * FROM storage.buckets WHERE id = 'avatars';

-- =====================================================
-- QUICK TEST QUERIES
-- =====================================================

-- Check if policies were created successfully
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%avatar%'
ORDER BY policyname;

-- =====================================================
-- NOTES
-- =====================================================
-- 
-- After running this script:
-- 1. The 'avatars' bucket will be created and set to public
-- 2. Users can only upload/update/delete avatars in their own folder (userId/avatar.jpg)
-- 3. Anyone can view avatars (public read access)
-- 4. The folder structure is: avatars/{userId}/avatar.jpg
--
-- If you still have issues:
-- 1. Check Supabase Dashboard > Storage > Policies
-- 2. Make sure the bucket 'avatars' exists
-- 3. Check that RLS is enabled on storage.objects
-- 4. Verify your Supabase URL and anon key in .env.local
--
-- =====================================================







