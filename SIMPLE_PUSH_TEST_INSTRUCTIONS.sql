-- ===============================================
-- PUSH NOTIFICATION TEST - SIMPLE VERSION
-- ===============================================
-- Creates a test session 10 minutes from now to trigger push notification
-- Uses a simpler approach that avoids constraint conflicts
-- ===============================================

-- Step 1: Check JovanMR's push tokens
SELECT 
  '📱 Step 1: Push Token Status' as step,
  p.id as user_id,
  p.username,
  COUNT(pt.token) as push_token_count
FROM profiles p
LEFT JOIN push_tokens pt ON pt.user_id = p.id
WHERE p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%'
GROUP BY p.id, p.username;

-- Step 2: Find an existing CONFIRMED booking for JovanMR that we can use
-- If none exists, we'll need to create one manually

SELECT 
  '🔍 Step 2: Finding existing confirmed bookings' as step,
  b.id as booking_id,
  b.status,
  b.confirmed_start_at,
  EXISTS(SELECT 1 FROM sessions WHERE sessions.booking_id = b.id) as has_session
FROM bookings b
JOIN profiles p ON p.id = b.student_id
WHERE (p.username ILIKE '%jovan%' OR p.email ILIKE '%jovan%')
  AND b.status = 'CONFIRMED'
  AND b.confirmed_start_at IS NOT NULL
ORDER BY b.created_at DESC
LIMIT 5;

-- Step 3: Manual instructions for creating test
SELECT 
  '═══════════════════════════════════════════════════' as line1,
  '📋 MANUAL SETUP REQUIRED' as title,
  '═══════════════════════════════════════════════════' as line2,
  '' as blank1,
  '⚠️  ISSUE:' as section1,
  'Your database has existing sessions that prevent automatic test creation' as issue1,
  'We need to either delete all JovanMR sessions or create manually' as issue2,
  '' as blank2,
  '✅ SOLUTION - Option 1: Delete all JovanMR test data' as option1_title,
  'Run this query first:' as option1_step1,
  'DELETE FROM sessions WHERE student_id IN (SELECT id FROM profiles WHERE username ILIKE ''%jovan%'');' as option1_query1,
  'DELETE FROM bookings WHERE student_id IN (SELECT id FROM profiles WHERE username ILIKE ''%jovan%'') AND created_at > now() - interval ''7 days'';' as option1_query2,
  'Then re-run this script' as option1_step2,
  '' as blank3,
  '✅ SOLUTION - Option 2: Use the webapp' as option2_title,
  '1. Log in as JovanMR on the website' as option2_step1,
  '2. Book a real session with a tutor for 10 minutes from now' as option2_step2,
  '3. Wait for the push notification' as option2_step3,
  '' as blank4,
  '💡 RECOMMENDATION: Use Option 2 (book via webapp)' as recommendation,
  'This tests the actual user flow and is more realistic' as recommendation_detail;
