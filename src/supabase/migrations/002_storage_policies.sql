-- iTutor Platform - Storage Bucket Policies
-- Run this AFTER 001_complete_schema_with_rls.sql
-- This sets up file upload capabilities for tutor certificate verification

-- =============================================================================
-- STORAGE BUCKET SETUP
-- =============================================================================

-- Create the verification_docs bucket for tutor certificates
-- Public: false (files are not publicly accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification_docs', 'verification_docs', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- STORAGE RLS POLICIES
-- =============================================================================

-- Policy: Authenticated users can upload to verification_docs
CREATE POLICY "Authenticated users can upload verification docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'verification_docs');

-- Policy: Users can view their own uploaded documents
CREATE POLICY "Users can view their own verification docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can view all verification documents
CREATE POLICY "Admins can view all verification docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs'
  AND public.is_admin()
);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own verification docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification_docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================================================
-- NOTES
-- =============================================================================

-- This migration creates a storage bucket for tutor certificate uploads
-- Files uploaded will follow the pattern: verification_docs/{tutor_id}/{filename}
-- 
-- Storage policies ensure:
-- 1. Any authenticated user can upload files
-- 2. Users can only view their own uploaded files
-- 3. Admins can view all files
-- 4. Users can delete their own files
--
-- The tutor verification workflow:
-- 1. Tutor uploads certificate (PDF, JPG, PNG) via frontend
-- 2. File is stored in: verification_docs/{tutor_id}/{timestamp}.{ext}
-- 3. Record created in tutor_verifications table with file URL
-- 4. Admin reviews and approves/rejects
-- 5. If approved, grades are extracted and stored in tutor_verified_subject_grades




