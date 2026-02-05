# Onboarding Email System - Testing Guide

This guide provides step-by-step instructions for testing the automated onboarding email sequence system.

## Prerequisites

Before testing, ensure:

1. **Database migrations are applied:**
   ```sql
   -- Run migrations 067 and 068
   -- Check with: SELECT * FROM onboarding_email_queue LIMIT 1;
   -- Check with: SELECT * FROM email_send_logs LIMIT 1;
   ```

2. **Environment variables are set:**
   ```bash
   RESEND_API_KEY=re_xxxxx...
   CRON_SECRET=your-secret-here
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000  # or your production URL
   ```

3. **Verify Resend configuration:**
   - Go to https://resend.com/domains
   - Ensure your domain is verified
   - Update `from` address in `lib/services/emailService.ts` if needed

## Test Plan

### Test 1: Student Signup & Welcome Email

**Objective:** Verify that a new student signup creates a queue entry and sends welcome email.

**Steps:**
1. Navigate to `/signup` (student signup page)
2. Fill out the form with test data:
   - Full Name: `Test Student`
   - Username: `teststudent123`
   - Email: Your test email (use a + alias like `you+test1@gmail.com`)
   - Country: Any
   - Password: Strong password
3. Complete signup

**Expected Results:**
- Signup succeeds and redirects to `/onboarding/student`
- Database check:
  ```sql
  SELECT * FROM onboarding_email_queue 
  WHERE user_type = 'student' 
  ORDER BY created_at DESC 
  LIMIT 1;
  ```
  Should show: `stage=0`, `is_active=true`, `next_send_at=now()`

**Trigger Email Send (Manual Test):**
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/send-onboarding-emails
```

**Expected Email Results:**
- Welcome email received in inbox
- Subject: "Welcome to iTutor, Test! 🎓"
- CTA button links to `/student/find-tutors`
- Check `email_send_logs`:
  ```sql
  SELECT * FROM email_send_logs 
  ORDER BY created_at DESC 
  LIMIT 1;
  ```
  Should show: `status='success'`, `stage=0`, `resend_email_id` populated

- Check queue updated:
  ```sql
  SELECT stage, next_send_at, last_sent_at, is_active 
  FROM onboarding_email_queue 
  WHERE user_id = 'YOUR_USER_ID';
  ```
  Should show: `stage=1`, `next_send_at=+1 day`, `last_sent_at=now()`, `is_active=true`

### Test 2: Tutor Signup & Welcome Email

**Objective:** Verify that tutor signup follows the same pattern.

**Steps:**
1. Navigate to `/signup/tutor`
2. Complete signup with test data
3. Verify queue entry created
4. Manually trigger cron job
5. Verify welcome email received

**Expected Results:**
- Email subject: "Welcome to iTutor, [Name]! Complete your profile 🎓"
- CTA links to `/onboarding/tutor`
- Different email content from student template

### Test 3: Email Sequence Progression

**Objective:** Verify emails are sent on schedule over 7 days.

**Approach A - Simulated (Fast Testing):**

Manually update `next_send_at` to test each stage:

```sql
-- Test Day 1 email
UPDATE onboarding_email_queue 
SET next_send_at = NOW() - INTERVAL '1 minute',
    stage = 1
WHERE user_id = 'YOUR_USER_ID';
```

Then trigger cron and verify Day 1 email received.

Repeat for stages 2, 3, 4.

**Approach B - Real-time (Production Test):**

Wait for actual intervals:
- Day 0: Welcome (immediate)
- Day 1: First follow-up (+1 day)
- Day 3: Second follow-up (+2 days)
- Day 5: Third follow-up (+2 days)
- Day 7: Final follow-up (+2 days)

Monitor the queue:
```sql
SELECT 
  user_type,
  stage,
  next_send_at,
  is_active,
  last_sent_at
FROM onboarding_email_queue
WHERE user_id = 'YOUR_USER_ID';
```

### Test 4: Activation - Student Books Session

**Objective:** Verify that creating a booking stops the email sequence.

**Steps:**
1. Create a test student with active email sequence (stage 0-3)
2. Create a booking for that student:
   ```sql
   -- Or use the UI to book a session
   INSERT INTO bookings (
     student_id, tutor_id, subject_id, 
     requested_start_at, requested_end_at, 
     price_ttd, status
   ) VALUES (
     'YOUR_STUDENT_ID', 'SOME_TUTOR_ID', 'SOME_SUBJECT_ID',
     NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour',
     100.00, 'PENDING'
   );
   ```
3. Trigger cron job
4. Check queue status

**Expected Results:**
```sql
SELECT is_active, stage 
FROM onboarding_email_queue 
WHERE user_id = 'YOUR_STUDENT_ID';
```
Should show: `is_active=false` (sequence stopped)

No new email sent, check logs show "deactivated" count increased.

### Test 5: Activation - Tutor Sets Availability

**Objective:** Verify that adding tutor_subjects stops the email sequence.

**Steps:**
1. Create a test tutor with active email sequence
2. Add tutor subjects:
   ```sql
   INSERT INTO tutor_subjects (
     tutor_id, subject_id, 
     price_per_hour_ttd, mode
   ) VALUES (
     'YOUR_TUTOR_ID', 'SOME_SUBJECT_ID',
     120.00, 'online'
   );
   ```
3. Trigger cron job
4. Check queue status

**Expected Results:**
- `is_active=false` in queue
- No more emails sent

### Test 6: Error Handling

**Objective:** Verify graceful error handling.

**Test A - Invalid Email:**
1. Manually insert queue entry with invalid email:
   ```sql
   -- Update test user's email to invalid format
   UPDATE profiles SET email = 'invalid-email-format' 
   WHERE id = 'TEST_USER_ID';
   ```
2. Trigger cron job
3. Check logs:
   ```sql
   SELECT status, error_message 
   FROM email_send_logs 
   WHERE user_id = 'TEST_USER_ID';
   ```
   Should show: `status='error'`, error_message populated

**Test B - Missing Resend API Key:**
1. Temporarily remove `RESEND_API_KEY` from environment
2. Trigger cron job
3. Verify error logged, other emails still process

### Test 7: Cron Job Authentication

**Objective:** Verify cron endpoint is secured.

**Test A - No Auth Header:**
```bash
curl http://localhost:3000/api/cron/send-onboarding-emails
```
**Expected:** 401 Unauthorized

**Test B - Wrong Secret:**
```bash
curl -H "Authorization: Bearer wrong-secret" \
  http://localhost:3000/api/cron/send-onboarding-emails
```
**Expected:** 401 Unauthorized

**Test C - Correct Secret:**
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/send-onboarding-emails
```
**Expected:** 200 OK with JSON response

### Test 8: Production Deployment

**Objective:** Verify system works in production.

**Steps:**
1. Deploy migrations to Supabase production
2. Set environment variables in Vercel:
   - `RESEND_API_KEY`
   - `CRON_SECRET`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy Next.js app to Vercel
4. Create a real signup (use a real email you control)
5. Monitor Vercel Logs:
   - Go to Vercel Dashboard > Project > Logs
   - Filter by "cron"
6. Check Vercel Cron Jobs tab:
   - Verify `/api/cron/send-onboarding-emails` runs every 15 minutes
   - Check execution logs for errors

**Production Monitoring Queries:**

Check queue health:
```sql
SELECT 
  user_type,
  stage,
  COUNT(*) as count,
  is_active
FROM onboarding_email_queue
GROUP BY user_type, stage, is_active
ORDER BY user_type, stage;
```

Check error rate:
```sql
SELECT 
  DATE(created_at) as date,
  status,
  COUNT(*) as count
FROM email_send_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), status
ORDER BY date DESC;
```

Check recent sends:
```sql
SELECT 
  user_type,
  stage,
  status,
  error_message,
  created_at
FROM email_send_logs
ORDER BY created_at DESC
LIMIT 20;
```

## Troubleshooting

### Issue: Emails not sending

**Check:**
1. Verify `RESEND_API_KEY` is set and valid
2. Check Resend dashboard for failed sends
3. Verify domain is verified in Resend
4. Check `email_send_logs` for error messages
5. Verify cron job is running (check Vercel logs)

### Issue: Queue entries not created

**Check:**
1. Verify migrations 067 and 068 are applied
2. Check browser console for errors during signup
3. Verify RLS policies allow service role access
4. Check if queue insert code is being called (add console.log)

### Issue: Sequence not stopping after activation

**Check:**
1. Verify bookings/tutor_subjects tables have data
2. Check `checkActivation` function logic in cron worker
3. Verify `is_active` is being set to false in database

### Issue: Wrong CTA URLs in emails

**Check:**
1. Verify `NEXT_PUBLIC_SITE_URL` environment variable is set
2. Check `getCtaUrl` function in `lib/email-templates/index.ts`
3. Update URLs if needed for production domain

## Success Criteria

✅ **All tests pass:**
- Student signup creates queue entry
- Tutor signup creates queue entry
- Parent signup creates queue entry
- Welcome emails send immediately
- Follow-up emails send on schedule
- Activation stops sequence
- Errors are logged gracefully
- Cron authentication works
- Production deployment successful

✅ **No errors in logs:**
- Check Vercel logs for 7 days
- Check `email_send_logs` for error status
- No unhandled exceptions

✅ **Monitoring in place:**
- Dashboard queries saved
- Alerts configured (optional)
- Weekly review scheduled

## Cleanup After Testing

```sql
-- Remove test queue entries
DELETE FROM onboarding_email_queue 
WHERE user_id IN (
  SELECT id FROM profiles 
  WHERE email LIKE '%+test%'
);

-- Remove test logs
DELETE FROM email_send_logs 
WHERE user_id IN (
  SELECT id FROM profiles 
  WHERE email LIKE '%+test%'
);

-- Remove test users (optional)
-- See DELETE_ALL_TEST_USERS.sql
```

## Next Steps

After successful testing:

1. **Monitor for first week:**
   - Daily checks of error logs
   - Review email open rates in Resend
   - Check activation rates

2. **Iterate on content:**
   - Update email copy based on user feedback
   - A/B test subject lines (Resend supports this)
   - Adjust timing intervals if needed

3. **Add analytics:**
   - Track email open rates
   - Track CTA click-through rates
   - Measure activation rates by cohort

4. **Expand system:**
   - Add more email stages if needed
   - Create different sequences for different user segments
   - Add re-engagement sequences for inactive users
