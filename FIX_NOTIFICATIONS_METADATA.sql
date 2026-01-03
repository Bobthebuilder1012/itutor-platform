-- =====================================================
-- FIX NOTIFICATIONS TABLE - ADD METADATA COLUMN
-- =====================================================
-- The lesson offers triggers need a metadata column that doesn't exist

-- First, check current notifications table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- Add metadata column if it doesn't exist
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Verify the column was added
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'notifications'
  AND column_name = 'metadata';

SELECT '✅ Metadata column added to notifications table!' AS status;







