# Email System Troubleshooting Guide

## 🔧 Quick Fixes Applied

### 1. Changed Email Domain
**Problem:** `noreply@myitutor.com` domain wasn't verified in Resend  
**Solution:** Now using Resend's test domain `onboarding@resend.dev` which is always verified

**What Changed:**
- `lib/services/emailService.ts` - Now uses `RESEND_FROM_EMAIL` env variable
- `.env.local` - Added `RESEND_FROM_EMAIL=iTutor <onboarding@resend.dev>`
- `env.example` - Documented the new variable

### 2. Added Extensive Logging
**Added to:** `app/api/send-welcome-email/route.ts`
- Logs every step of the email sending process
- Shows profile data, email sending status, and detailed errors
- All logs appear in your terminal/console

### 3. Created Test Endpoint
**New file:** `app/api/test-email/route.ts`
- Simple endpoint to test Resend configuration
- Uses Resend's test inbox

---

## 🧪 Testing Steps

### Step 1: Test Resend Configuration
```bash
# Open in browser or use curl
http://localhost:3000/api/test-email
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Email test successful!",
  "data": { "id": "..." },
  "apiKeyConfigured": true
}
```

**If Failed:**
- Check if `RESEND_API_KEY` is set correctly in `.env.local`
- Verify API key is valid at https://resend.com/api-keys
- Check terminal for detailed error logs

### Step 2: Test Welcome Email API
```bash
# Replace USER_ID with an actual user ID from your database
curl -X POST http://localhost:3000/api/send-welcome-email \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID_HERE"}'
```

**Watch Terminal Output:**
```
=== WELCOME EMAIL API CALLED ===
User ID: ...
Profile found: { email: ..., name: ..., role: ... }
Sending onboarding email...
Email sent successfully: { id: ..., from: ..., to: ... }
```

### Step 3: Test Full Signup Flow
1. **Open terminal and watch for logs**
2. **Sign up a new user** at `http://localhost:3000/signup`
3. **Check terminal** for:
   ```
   === WELCOME EMAIL API CALLED ===
   Profile found: ...
   Email sent successfully: ...
   ```
4. **Check email** - If using test domain, email goes to Resend's logs
5. **Check database:**
   ```sql
   -- Check email_send_logs table
   SELECT * FROM email_send_logs ORDER BY created_at DESC LIMIT 5;
   
   -- Check email queue
   SELECT * FROM onboarding_email_queue ORDER BY created_at DESC LIMIT 5;
   ```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Email not sending"
**Symptoms:** Signup works but no email arrives

**Debug Steps:**
1. Check terminal for `=== WELCOME EMAIL API CALLED ===` message
   - If NOT present: Signup isn't calling the API
   - If present: Check error messages below

2. Look for Resend API errors in terminal:
   ```
   Resend API error (403): Domain not verified
   Resend API error (401): Invalid API key
   Resend API error (422): Validation error
   ```

**Solutions:**
- **403 Error:** Use `onboarding@resend.dev` (we fixed this!)
- **401 Error:** Check `RESEND_API_KEY` in `.env.local`
- **422 Error:** Check email format in logs

### Issue 2: "API Key not working"
**Symptoms:** Test endpoint returns `apiKeyConfigured: false`

**Solutions:**
1. **Check .env.local file exists** in project root
2. **Restart dev server** after changing `.env.local`:
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```
3. **Verify API key format:** Should start with `re_`
4. **Generate new key** at https://resend.com/api-keys

### Issue 3: "Profile not found"
**Symptoms:** Error in logs: `Profile not found`

**Solutions:**
1. **Check if profile was created:**
   ```sql
   SELECT id, email, full_name, role 
   FROM profiles 
   WHERE id = 'USER_ID_HERE';
   ```
2. **If profile missing:** There's an issue with signup profile creation
3. **Check RLS policies:** Service role should bypass RLS

### Issue 4: "Emails going to spam"
**Symptoms:** Emails send but land in spam folder

**Solutions:**
- **Short term:** Check spam folder, mark as "Not Spam"
- **Production fix:** 
  1. Verify your own domain in Resend
  2. Set up SPF, DKIM records
  3. Use your verified domain instead of `onboarding@resend.dev`

### Issue 5: "Database errors"
**Symptoms:** `error: relation "email_send_logs" does not exist`

**Solutions:**
1. **Run migrations:**
   ```sql
   -- In Supabase SQL Editor, run:
   -- migrations/067_create_onboarding_email_queue.sql
   -- migrations/068_create_email_send_logs.sql
   ```
2. **Verify tables exist:**
   ```sql
   \dt public.email_send_logs
   \dt public.onboarding_email_queue
   ```

---

## 📊 Monitoring Email Activity

### Check Email Logs
```sql
-- Recent email sends
SELECT 
  email_type,
  status,
  error_message,
  created_at
FROM email_send_logs
ORDER BY created_at DESC
LIMIT 10;

-- Success rate
SELECT 
  status,
  COUNT(*) as count
FROM email_send_logs
GROUP BY status;
```

### Check Email Queue
```sql
-- Active queue items
SELECT 
  user_type,
  stage,
  next_send_at,
  is_active
FROM onboarding_email_queue
WHERE is_active = true;

-- Upcoming emails (next 24 hours)
SELECT 
  u.email,
  q.user_type,
  q.stage,
  q.next_send_at
FROM onboarding_email_queue q
JOIN profiles p ON q.user_id = p.id
WHERE q.is_active = true
  AND q.next_send_at < NOW() + INTERVAL '24 hours'
ORDER BY q.next_send_at;
```

### Resend Dashboard
**View sent emails:**
1. Go to https://resend.com/emails
2. See all sent emails, opens, clicks
3. Check delivery status and bounces

---

## 🚀 Production Setup (After Testing)

### 1. Verify Your Domain
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Add your domain (e.g., `myitutor.com`)
4. Add DNS records (SPF, DKIM) to your domain provider
5. Wait for verification (usually 5-15 minutes)

### 2. Update Environment Variable
```env
# In .env.local and production environment
RESEND_FROM_EMAIL=iTutor <noreply@myitutor.com>
```

### 3. Test with Real Email
```bash
# Test with your personal email
curl -X POST http://localhost:3000/api/send-welcome-email \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_TEST_USER_ID"}'
```

### 4. Enable Cron Job
**For Vercel:**
- Cron is automatically configured in `vercel.json`
- Runs every 15 minutes
- Add `CRON_SECRET` to Vercel environment variables

**To trigger manually:**
```bash
curl -X GET http://localhost:3000/api/cron/send-onboarding-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 📝 Quick Reference

### Important Files
- `lib/services/emailService.ts` - Email sending logic
- `app/api/send-welcome-email/route.ts` - Welcome email endpoint
- `app/api/cron/send-onboarding-emails/route.ts` - Cron job for sequence
- `app/api/test-email/route.ts` - Test endpoint
- `lib/email-templates/` - All email templates

### Environment Variables
```env
RESEND_API_KEY=re_...                              # Required
RESEND_FROM_EMAIL=iTutor <onboarding@resend.dev>  # Required  
CRON_SECRET=...                                     # Required for cron
```

### Database Tables
- `onboarding_email_queue` - Manages email sequence
- `email_send_logs` - Audit trail of sent emails

### API Endpoints
- `POST /api/send-welcome-email` - Send immediate welcome email
- `GET /api/cron/send-onboarding-emails` - Process email queue
- `GET /api/test-email` - Test Resend configuration

---

## 🆘 Still Having Issues?

### Check These First:
1. ✅ Dev server restarted after `.env.local` changes
2. ✅ Terminal showing logs (verbose output)
3. ✅ `RESEND_API_KEY` starts with `re_`
4. ✅ Using `onboarding@resend.dev` as from address
5. ✅ Database migrations ran successfully

### Get Detailed Error Info:
```bash
# In terminal while running dev server:
# Watch for these log prefixes:
=== WELCOME EMAIL API CALLED ===
=== ERROR SENDING WELCOME EMAIL ===
```

### Test Each Component:
1. **Test Resend:** `/api/test-email` ✅
2. **Test Welcome API:** `/api/send-welcome-email` ✅
3. **Test Signup:** Create new user ✅
4. **Test Cron:** Manually trigger cron endpoint ✅

---

## 📞 Support Resources

### Resend Documentation
- **API Reference:** https://resend.com/docs/api-reference/emails/send-email
- **Domain Setup:** https://resend.com/docs/dashboard/domains/introduction
- **Troubleshooting:** https://resend.com/docs/knowledge-base/common-errors

### Next Steps
1. Run `/api/test-email` to verify Resend works
2. Watch terminal during next signup
3. Check `email_send_logs` table
4. Review this guide if issues persist

**Current Status:** 
- ✅ Fixed domain issue (using test domain)
- ✅ Added extensive logging
- ✅ Created test endpoint
- 🔄 Ready for testing!
