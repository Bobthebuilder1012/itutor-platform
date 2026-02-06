# 🚀 Automated Onboarding Email System - Complete Setup Guide

## Overview
This system automatically sends personalized onboarding emails to new users based on their role (student, tutor, parent) at scheduled intervals. Emails stop automatically when users become active.

---

## 📋 Setup Steps

### 1. **Run Database Migrations**

Run this SQL in Supabase SQL Editor:
```sql
-- File: CREATE_ONBOARDING_EMAIL_TABLES.sql
```

This creates:
- `onboarding_email_queue` - Tracks scheduled emails
- `email_send_logs` - Logs all sent emails

### 2. **Configure Environment Variables**

Add to your `.env.local`:
```env
# Resend Email Service
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=iTutor <hello@myitutor.com>

# Cron Job Security
CRON_SECRET=your-random-secret-32-chars-min

# Supabase Service Role (for admin operations)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Generate CRON_SECRET:**
```bash
openssl rand -base64 32
```

### 3. **Install Resend Package**

```bash
npm install resend
```

### 4. **Deploy to Vercel**

The `vercel.json` is already configured with the cron job:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-onboarding-emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

This runs every 15 minutes.

### 5. **Verify Domain in Resend**

1. Go to https://resend.com/domains
2. Add `myitutor.com`
3. Add DNS records to your domain
4. Wait for verification

---

## 🔄 How It Works

### Email Schedule

**Students:**
- Stage 0: Welcome email (immediate)
- Stage 1: Day 1 follow-up (24 hours)
- Stage 3: Day 3 follow-up (72 hours)

**Tutors:**
- Stage 0: Welcome + setup instructions (immediate)
- Stage 1: Day 1 reminder to complete profile (24 hours)

**Parents:**
- Same as students

### Automatic Stopping

Emails stop automatically when users become active:
- **Students**: After booking their first session
- **Tutors**: After completing profile (bio + subjects)
- **Parents**: After adding their first child

### Workflow

```
New User Signs Up
       ↓
Queue Created (3 emails scheduled)
       ↓
Cron runs every 15 min
       ↓
Checks if user is still inactive
       ↓
   Yes? Send email
   No? Cancel remaining emails
```

---

## 📁 File Structure

```
app/
├── api/
│   ├── cron/
│   │   └── send-onboarding-emails/
│   │       └── route.ts              # Cron job worker
│   └── auth/
│       └── signup-with-emails/
│           └── route.ts              # Signup with email queueing

lib/
├── services/
│   ├── emailService.ts               # Core email sending logic
│   └── onboardingEmailQueue.ts       # Queue management

SQL Scripts:
├── CREATE_ONBOARDING_EMAIL_TABLES.sql    # Database setup
```

---

## 🧪 Testing

### Test Locally

1. **Create a test user:**
```bash
POST /api/auth/signup-with-emails
{
  "email": "test@example.com",
  "password": "password123",
  "fullName": "Test User",
  "role": "student"
}
```

2. **Trigger cron manually:**
```bash
curl http://localhost:3000/api/cron/send-onboarding-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

3. **Check queue:**
```sql
SELECT * FROM onboarding_email_queue 
WHERE user_id = 'user-id-here'
ORDER BY stage;
```

4. **Check logs:**
```sql
SELECT * FROM email_send_logs 
WHERE user_id = 'user-id-here'
ORDER BY sent_at DESC;
```

---

## 🔍 Monitoring

### Admin Dashboard Queries

**Pending Emails:**
```sql
SELECT 
  COUNT(*) as pending_count,
  user_type,
  stage
FROM onboarding_email_queue
WHERE status = 'pending'
GROUP BY user_type, stage;
```

**Emails Sent Today:**
```sql
SELECT 
  COUNT(*) as emails_sent,
  email_type,
  status
FROM email_send_logs
WHERE sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY email_type, status;
```

**Failed Emails:**
```sql
SELECT 
  user_id,
  stage,
  error_message,
  scheduled_for
FROM onboarding_email_queue
WHERE status = 'failed'
ORDER BY scheduled_for DESC
LIMIT 20;
```

---

## ⚙️ Configuration

### Customize Email Schedule

Edit `lib/services/onboardingEmailQueue.ts`:

```typescript
function getEmailSchedule(userType: string) {
  return [
    { stage: 0, delayMinutes: 0 },      // Immediate
    { stage: 1, delayMinutes: 1440 },   // 24 hours
    { stage: 3, delayMinutes: 4320 },   // 72 hours
    { stage: 7, delayMinutes: 10080 },  // 7 days (optional)
  ];
}
```

### Customize Activity Detection

Edit `app/api/cron/send-onboarding-emails/route.ts` in the `checkUserInactive` function.

---

## 🐛 Troubleshooting

### Emails Not Sending

1. **Check cron secret:**
```bash
# In Vercel dashboard → Settings → Environment Variables
# Ensure CRON_SECRET matches your config
```

2. **Check Resend API key:**
```bash
curl https://api.resend.com/emails \
  -H "Authorization: Bearer YOUR_RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@resend.dev","to":"your@email.com","subject":"Test","html":"<p>Test</p>"}'
```

3. **Check Vercel logs:**
```bash
vercel logs
```

### Queue Not Created

Check signup integration - ensure `queueOnboardingEmails` is called after user creation.

### Emails Not Stopping

Verify activity detection logic in `checkUserInactive` function.

---

## 🚨 Production Checklist

- [ ] Domain verified in Resend
- [ ] CRON_SECRET set in Vercel environment variables
- [ ] SUPABASE_SERVICE_ROLE_KEY set (keep secret!)
- [ ] Database tables created
- [ ] Email templates populated
- [ ] Test with real email
- [ ] Monitor for first 24 hours
- [ ] Set up error alerts

---

## 📊 Success Metrics

Track these metrics to measure system health:

1. **Email Delivery Rate**: `sent / (sent + failed)`
2. **Cancellation Rate**: % of emails cancelled due to user activity
3. **User Activation Rate**: % of users who become active before Day 3
4. **Template Effectiveness**: Track click-through rates per stage

---

## 🔐 Security Notes

- ⚠️ **Never commit `.env.local`**
- ⚠️ **Keep CRON_SECRET and SERVICE_ROLE_KEY secret**
- ⚠️ **Use environment variables, not hardcoded secrets**
- ⚠️ **Verify domain in Resend to avoid spoofing**

---

## 🎯 Next Steps

1. **Run SQL migrations** (`CREATE_ONBOARDING_EMAIL_TABLES.sql`)
2. **Update environment variables**
3. **Deploy to Vercel**
4. **Test with a real signup**
5. **Monitor email logs**

The system is now fully automated! 🎉
