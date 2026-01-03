-- =====================================================
-- CHECK IF REQUIRED TABLES EXIST
-- =====================================================

-- Check all required tables
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM (
  VALUES 
    ('profiles'),
    ('bookings'),
    ('tutor_video_provider_connections'),
    ('sessions'),
    ('session_events')
) AS t(table_name);

-- If bookings exists, show its columns
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bookings') THEN
    RAISE NOTICE 'Bookings table columns:';
  END IF;
END $$;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'bookings'
AND column_name IN ('id', 'confirmed_start_at', 'confirmed_end_at', 'price_ttd', 'tutor_id', 'student_id')
ORDER BY ordinal_position;







