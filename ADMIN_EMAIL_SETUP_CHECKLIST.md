# Admin Email System - Setup Checklist

## ✅ Complete Setup Steps

### 1. Database Setup
- [ ] Run `CREATE_EMAIL_TEMPLATES_TABLE.sql` in Supabase SQL Editor
- [ ] Verify `email_templates` table was created
- [ ] Check RLS policies are active

### 2. Resend Configuration
- [ ] Sign up for Resend account (if not already)
- [ ] Get API key from https://resend.com/api-keys
- [ ] Add domain `myitutor.com` in Resend dashboard
- [ ] Add DNS records provided by Resend to your domain
- [ ] Wait for domain verification (usually 5-10 minutes)
- [ ] Verify `hello@myitutor.com` is listed as a verified sender

### 3. Environment Variables
- [ ] Update `.env.local`:
  ```env
  RESEND_API_KEY=your_actual_api_key
  RESEND_FROM_EMAIL=iTutor <hello@myitutor.com>
  ```
- [ ] Restart dev server: `npm run dev`

### 4. Test the System
- [ ] Log in as admin user
- [ ] Navigate to `/admin/emails`
- [ ] Go to "Mailing List" tab
- [ ] Verify users are loading
- [ ] Select a test user (yourself)
- [ ] Go to "Send Email" tab
- [ ] Compose a test email:
  ```
  Subject: Test Email from iTutor Admin
  Content: <h1>Test Email</h1><p>Hello {{firstName}}, this is a test!</p>
  ```
- [ ] Send email
- [ ] Check inbox for test email

### 5. Create Initial Templates
Create templates for the onboarding sequence:

#### Student Templates
- [ ] Welcome Email (Stage 0)
- [ ] Day 1: Ready for first session (Stage 1)
- [ ] Day 3: How iTutor works (Stage 3)
- [ ] Day 5: Top iTutors available (Stage 5)
- [ ] Day 7: Need help getting started (Stage 7)

#### Tutor Templates
- [ ] Welcome Email (Stage 0)
- [ ] Day 1: Set rates & availability (Stage 1)
- [ ] Day 3: Get your first student (Stage 3)
- [ ] Day 5: Profile improvement tips (Stage 5)
- [ ] Day 7: Get verified (Stage 7)

### 6. Deploy to Production
- [ ] Add environment variables to Vercel/production hosting
- [ ] Test email sending in production
- [ ] Monitor first few sends for deliverability
- [ ] Set up email monitoring in Resend dashboard

## 🔍 Verification Commands

### Check if table exists:
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'email_templates'
);
```

### Check RLS policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'email_templates';
```

### Count templates:
```sql
SELECT COUNT(*) FROM email_templates;
```

### Check admin user:
```sql
SELECT id, email, role 
FROM profiles 
WHERE role = 'admin';
```

## 🚨 Troubleshooting

### Can't access /admin/emails
- Check if logged in user has `role = 'admin'` in profiles table
- Verify authentication is working

### Emails not sending
- Check Resend API key is correct
- Verify domain is verified in Resend
- Check console logs for errors
- Test with a verified email address first

### Users not appearing in mailing list
- Check if users have email addresses
- Verify role values are correct (student, tutor, parent, admin)
- Check date filters

### Templates not saving
- Verify admin authentication
- Check browser console for errors
- Verify RLS policies are set correctly

## 📊 Access the System

**Admin Account:** `admin@myitutor.com`

**URLs:**
- Admin Dashboard: `http://localhost:3000/admin/dashboard` (dev)
- Email Management: `http://localhost:3000/admin/emails` (dev)
- Production: `https://yourdomain.com/admin/dashboard`

**Requirements:**
- Must be logged in as admin@myitutor.com
- User account must have `role = 'admin'` in profiles table

## 📧 Email Best Practices

1. **Test First:** Always send to yourself first
2. **Small Batches:** Start with small groups (10-20 users)
3. **Monitor:** Watch Resend dashboard for bounces/spam complaints
4. **Personalize:** Use `{{firstName}}` for better engagement
5. **Clear CTAs:** One primary action per email
6. **Mobile-Friendly:** Test on mobile devices
7. **Unsubscribe:** Consider adding unsubscribe option for bulk sends

## 🎯 Next Steps

Once setup is complete:
1. Create your first email template
2. Test sending to yourself
3. Send a welcome email to recent signups
4. Set up automated onboarding sequence (if needed)
5. Monitor email performance in Resend dashboard

## 📚 Resources

- **Resend Docs:** https://resend.com/docs
- **Email Best Practices:** https://resend.com/docs/knowledge-base/best-practices
- **Domain Verification:** https://resend.com/docs/dashboard/domains/introduction
- **iTutor Guide:** See `ADMIN_EMAIL_SYSTEM_GUIDE.md`
