-- ===============================================
-- PUSH NOTIFICATION DIAGNOSTIC
-- ===============================================
-- Run this to diagnose why push notifications aren't working
-- ===============================================

-- 1. Check if Edge Function has run recently
SELECT 
  '🔍 Step 1: Edge Function Activity' as step,
  COUNT(*) as total_logs,
  MAX(sent_at) as last_run,
  EXTRACT(EPOCH FROM (now() - MAX(sent_at))) / 60 as minutes_since_last_run
FROM notifications_log
WHERE sent_at > now() - interval '24 hours';

-- 2. Check if JovanMR has push tokens registered
SELECT 
  '📱 Step 2: JovanMR Push Tokens' as step,
  p.id as user_id,
  p.username,
  COUNT(pt.token) as token_count,
  array_agg(
    jsonb_build_object(
      'platform', pt.platform,
      'created_at', pt.created_at,
      'last_used_at', pt.last_used_at
    )
  ) FILTER (WHERE pt.token IS NOT NULL) as tokens
FROM profiles p
LEFT JOIN push_tokens pt ON pt.user_id = p.id
WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%'
GROUP BY p.id, p.username;

-- 3. Check for upcoming sessions for JovanMR
SELECT 
  '⏰ Step 3: Upcoming Sessions for JovanMR' as step,
  s.id as session_id,
  s.scheduled_start_at,
  EXTRACT(EPOCH FROM (s.scheduled_start_at - now())) / 60 as minutes_until_start,
  s.status,
  s.provider,
  p.username as student
FROM sessions s
JOIN profiles p ON p.id = s.student_id
WHERE (p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%')
  AND s.scheduled_start_at > now()
  AND s.scheduled_start_at < now() + interval '2 hours'
  AND s.status = 'SCHEDULED'
ORDER BY s.scheduled_start_at;

-- 4. Check notification logs for JovanMR
SELECT 
  '📜 Step 4: Recent Notification Attempts for JovanMR' as step,
  nl.notification_type,
  nl.sent_at,
  nl.session_id,
  nl.metadata,
  EXTRACT(EPOCH FROM (now() - nl.sent_at)) / 60 as minutes_ago
FROM notifications_log nl
JOIN sessions s ON s.id = nl.session_id
JOIN profiles p ON p.id = s.student_id
WHERE (p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%')
ORDER BY nl.sent_at DESC
LIMIT 10;

-- 5. Check if there are ANY push tokens in the system
SELECT 
  '🌐 Step 5: System-wide Push Token Status' as step,
  COUNT(DISTINCT user_id) as users_with_tokens,
  COUNT(*) as total_tokens,
  array_agg(DISTINCT platform) as platforms
FROM push_tokens;

-- 6. Summary and Recommendations
SELECT 
  '═══════════════════════════════════════════════════' as line1,
  '📊 DIAGNOSTIC SUMMARY' as title,
  '═══════════════════════════════════════════════════' as line2,
  '' as blank1,
  '✅ WHAT TO CHECK:' as section1,
  '1. Does JovanMR have push tokens? (See Step 2)' as check1,
  '2. Are there upcoming sessions? (See Step 3)' as check2,
  '3. Has the Edge Function run recently? (See Step 1)' as check3,
  '4. Are there any notification logs? (See Step 4)' as check4,
  '' as blank2,
  '💡 COMMON ISSUES:' as section2,
  '- No push tokens = User needs to log in on mobile/enable notifications' as issue1,
  '- No upcoming sessions = Create a test session 10 min from now' as issue2,
  '- Edge Function not running = Check Supabase Edge Function schedule' as issue3,
  '- FCM not configured = Check Supabase Project Settings → Edge Functions' as issue4;
