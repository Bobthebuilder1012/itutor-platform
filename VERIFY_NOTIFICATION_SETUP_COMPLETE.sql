-- =====================================================
-- COMPLETE NOTIFICATION SYSTEM VERIFICATION
-- =====================================================
-- Run this in Supabase SQL Editor to verify everything is set up
-- =====================================================

-- 1) CHECK REQUIRED TABLES EXIST
SELECT 
  'TABLE CHECK' as test_category,
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ All tables exist'
    ELSE '❌ Missing tables: ' || (3 - COUNT(*))::text
  END as status,
  STRING_AGG(table_name, ', ') as tables_found
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('push_tokens', 'notifications', 'notifications_log');

-- 2) CHECK PUSH_TOKENS TABLE STRUCTURE
SELECT 
  'PUSH_TOKENS SCHEMA' as test_category,
  CASE 
    WHEN COUNT(*) >= 5 THEN '✅ Schema correct'
    ELSE '❌ Missing columns'
  END as status,
  STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'push_tokens'
  AND column_name IN ('id', 'user_id', 'token', 'platform', 'created_at');

-- 3) CHECK NOTIFICATIONS TABLE STRUCTURE
SELECT 
  'NOTIFICATIONS SCHEMA' as test_category,
  CASE 
    WHEN COUNT(*) >= 6 THEN '✅ Schema correct'
    ELSE '❌ Missing columns'
  END as status,
  STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'notifications'
  AND column_name IN ('id', 'user_id', 'type', 'title', 'message', 'is_read');

-- 4) CHECK NOTIFICATIONS_LOG TABLE STRUCTURE
SELECT 
  'NOTIFICATIONS_LOG SCHEMA' as test_category,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ Schema correct'
    ELSE '❌ Missing columns'
  END as status,
  STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'notifications_log'
  AND column_name IN ('id', 'user_id', 'session_id', 'type');

-- 5) CHECK UNIQUE CONSTRAINT ON NOTIFICATIONS_LOG
SELECT 
  'NOTIFICATIONS_LOG CONSTRAINT' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Unique constraint exists'
    ELSE '❌ Missing unique constraint on (user_id, session_id, type)'
  END as status,
  STRING_AGG(constraint_name, ', ') as constraints
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'notifications_log'
  AND constraint_type = 'UNIQUE';

-- 6) CHECK JOVANMR USER EXISTS
SELECT 
  'JOVANMR USER' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ User found'
    ELSE '❌ User not found'
  END as status,
  STRING_AGG(username || ' (' || role || ')', ', ') as user_info
FROM profiles
WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%';

-- 7) CHECK JOVANMR PUSH TOKENS
SELECT 
  'JOVANMR PUSH TOKENS' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Has ' || COUNT(*) || ' push token(s)'
    ELSE '⚠️ No push tokens registered - user needs to grant browser permission'
  END as status,
  STRING_AGG(platform, ', ') as platforms
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%';

-- 8) CHECK TOTAL PUSH TOKENS IN SYSTEM
SELECT 
  'SYSTEM PUSH TOKENS' as test_category,
  '✅ ' || COUNT(*) || ' total push tokens registered' as status,
  COUNT(DISTINCT user_id) || ' unique users' as users
FROM push_tokens;

-- 9) CHECK RECENT NOTIFICATIONS
SELECT 
  'RECENT NOTIFICATIONS' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' notifications sent in last 24h'
    ELSE '⚠️ No notifications sent in last 24 hours'
  END as status,
  COUNT(DISTINCT user_id) || ' users notified' as users
FROM notifications
WHERE created_at > now() - interval '24 hours';

-- 10) CHECK NOTIFICATIONS_LOG ACTIVITY
SELECT 
  'NOTIFICATIONS_LOG ACTIVITY' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' notifications logged in last 24h'
    ELSE '⚠️ No notifications logged - Edge Function may not be running'
  END as status,
  STRING_AGG(DISTINCT type, ', ') as notification_types
FROM notifications_log
WHERE sent_at > now() - interval '24 hours';

-- 11) CHECK UPCOMING SESSIONS (for notification testing)
SELECT 
  'UPCOMING SESSIONS' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' sessions scheduled in next hour'
    ELSE '⚠️ No upcoming sessions to trigger notifications'
  END as status,
  MIN(scheduled_start_at)::text as next_session
FROM sessions
WHERE status = 'SCHEDULED'
  AND scheduled_start_at > now()
  AND scheduled_start_at < now() + interval '1 hour';

-- 12) CHECK SESSIONS INDEX
SELECT 
  'SESSIONS INDEX' as test_category,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Performance index exists'
    ELSE '❌ Missing index: idx_sessions_status_scheduled_start'
  END as status,
  STRING_AGG(indexname, ', ') as indexes
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'sessions'
  AND indexname = 'idx_sessions_status_scheduled_start';

-- 13) FINAL SUMMARY
SELECT 
  '========================' as separator,
  'NOTIFICATION SETUP SUMMARY' as title,
  '========================' as separator2;

-- Show detailed breakdown
SELECT 
  'Database Tables' as component,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('push_tokens', 'notifications', 'notifications_log')) = 3 
    THEN '✅ READY'
    ELSE '❌ NOT READY'
  END as status
UNION ALL
SELECT 
  'JovanMR User',
  CASE 
    WHEN (SELECT COUNT(*) FROM profiles WHERE username ILIKE '%jovan%' OR email ILIKE '%jovan%') > 0 
    THEN '✅ FOUND'
    ELSE '❌ NOT FOUND'
  END
UNION ALL
SELECT 
  'JovanMR Push Tokens',
  CASE 
    WHEN (SELECT COUNT(*) FROM push_tokens pt JOIN profiles p ON p.id = pt.user_id WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%') > 0 
    THEN '✅ REGISTERED'
    ELSE '⚠️ NEEDS BROWSER PERMISSION'
  END
UNION ALL
SELECT 
  'System Push Tokens',
  CASE 
    WHEN (SELECT COUNT(*) FROM push_tokens) > 0 
    THEN '✅ ' || (SELECT COUNT(*) FROM push_tokens)::text || ' TOKENS'
    ELSE '⚠️ NO TOKENS'
  END
UNION ALL
SELECT 
  'Recent Activity',
  CASE 
    WHEN (SELECT COUNT(*) FROM notifications_log WHERE sent_at > now() - interval '24 hours') > 0 
    THEN '✅ ACTIVE'
    ELSE '⚠️ NO RECENT ACTIVITY'
  END;

-- 14) INSTRUCTIONS FOR NEXT STEPS
SELECT 
  '📋 NEXT STEPS' as title,
  CASE 
    WHEN (SELECT COUNT(*) FROM push_tokens pt JOIN profiles p ON p.id = pt.user_id WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%') = 0
    THEN '1. JovanMR needs to visit the site and grant browser notification permission
2. Then run SEND_TEST_NOTIFICATION.sql to send a test notification
3. Check JovanMR''s notifications page to verify'
    ELSE '✅ Ready to send test notification! Run SEND_TEST_NOTIFICATION.sql'
  END as instructions;
