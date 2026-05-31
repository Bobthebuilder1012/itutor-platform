-- =====================================================
-- ENVIRONMENT VARIABLES - WHERE TO FIND THEM
-- =====================================================
-- Most env vars CANNOT be retrieved via SQL.
-- They are external service credentials stored outside the database.
-- Use this guide to find each one:

-- =====================================================
-- 1. SUPABASE KEYS (Cannot retrieve via SQL)
-- =====================================================
-- Location: Supabase Dashboard → Project Settings → API
-- You need:
--   - NEXT_PUBLIC_SUPABASE_URL (e.g., https://xxxxx.supabase.co)
--   - NEXT_PUBLIC_SUPABASE_ANON_KEY (starts with "eyJ...")
--   - SUPABASE_SERVICE_ROLE_KEY (starts with "eyJ...")

-- =====================================================
-- 2. GOOGLE OAUTH CREDENTIALS (Cannot retrieve via SQL)
-- =====================================================
-- Location: Google Cloud Console
-- URL: https://console.cloud.google.com/apis/credentials
-- You need:
--   - GOOGLE_CLIENT_ID (ends with .apps.googleusercontent.com)
--   - GOOGLE_CLIENT_SECRET

-- =====================================================
-- 3. ZOOM OAUTH CREDENTIALS (Cannot retrieve via SQL)
-- =====================================================
-- Location: Zoom Marketplace
-- URL: https://marketplace.zoom.us/develop/apps
-- You need:
--   - ZOOM_CLIENT_ID
--   - ZOOM_CLIENT_SECRET

-- =====================================================
-- 4. FEATURE FLAGS (Can be managed in database or env)
-- =====================================================
-- Currently in .env.local:
--   PAID_CLASSES_ENABLED=false

-- Optional: Create a feature_flags table to manage in DB instead:
/*
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('PAID_CLASSES_ENABLED', false, 'Controls whether prices are shown on the platform')
ON CONFLICT (flag_name) DO NOTHING;

-- To check feature flags:
SELECT * FROM feature_flags;
*/

-- =====================================================
-- 5. VAPID KEYS (Generate new ones, cannot retrieve old)
-- =====================================================
-- Generate in terminal with:
--   npx web-push generate-vapid-keys
-- You need:
--   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (starts with "B...")
--   - VAPID_PRIVATE_KEY
--   - VAPID_SUBJECT (mailto:your-email@myitutor.com)

-- =====================================================
-- WHAT CAN BE CHECKED IN DATABASE:
-- =====================================================

-- Check if video provider connections exist (shows if OAuth is working)
SELECT 
  COUNT(*) as total_connections,
  provider,
  COUNT(CASE WHEN access_token_expires_at > NOW() THEN 1 END) as active_tokens,
  COUNT(CASE WHEN access_token_expires_at <= NOW() THEN 1 END) as expired_tokens
FROM tutor_video_provider_connections
GROUP BY provider;

-- Check if push tokens are being registered (shows if VAPID is working)
SELECT 
  platform,
  COUNT(*) as registered_devices,
  MAX(created_at) as last_registration
FROM push_tokens
GROUP BY platform;

-- Verify Supabase URL (check against your actual URL)
-- This will show you're connected to the right project
SELECT current_database() as database_name;

-- Check notification system setup
SELECT 
  type,
  COUNT(*) as notification_count,
  MAX(created_at) as latest_notification
FROM notifications
GROUP BY type
ORDER BY notification_count DESC;

-- =====================================================
-- QUICK CHECKLIST:
-- =====================================================
-- [ ] Get Supabase keys from Dashboard → Settings → API
-- [ ] Get Google OAuth from Google Cloud Console
-- [ ] Get Zoom OAuth from Zoom Marketplace  
-- [ ] Generate VAPID keys with: npx web-push generate-vapid-keys
-- [ ] Set PAID_CLASSES_ENABLED=false (already set)
-- [ ] Restart dev server after updating .env.local
-- =====================================================
