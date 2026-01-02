-- =====================================================
-- SETUP VERIFICATION UPLOADS STORAGE BUCKET
-- =====================================================
-- Creates Supabase Storage bucket for verification documents with RLS policies

-- 1. CREATE BUCKET
-- Create the verification_uploads bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification_uploads', 
  'verification_uploads', 
  false,  -- Private bucket
  10485760,  -- 10MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. NOTE: RLS POLICIES MUST BE CREATED VIA SUPABASE DASHBOARD
-- Storage RLS policies cannot be created via SQL due to permission restrictions
-- See SETUP_VERIFICATION_STORAGE_POLICIES.md for instructions

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Verification uploads storage bucket created successfully!';
    RAISE NOTICE 'Bucket: verification_uploads (private)';
    RAISE NOTICE 'File size limit: 10MB';
    RAISE NOTICE 'Allowed types: JPEG, PNG, WebP, PDF';
    RAISE NOTICE 'Path structure: verification_uploads/<tutor_id>/<request_id>/<filename>';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NEXT STEP: Create RLS policies via Supabase Dashboard';
    RAISE NOTICE '📖 See SETUP_VERIFICATION_STORAGE_POLICIES.md for instructions';
END $$;

