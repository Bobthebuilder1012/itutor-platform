# iTutor Admin Account - Complete Guide

## 🔐 Admin Account Access

**Email:** `admin@myitutor.com`  
**Setup:** See `SETUP_ADMIN_ACCOUNT.sql` for configuration

## 📍 Admin Dashboard Navigation

Once logged in as admin, you'll have access to:

### **Dashboard** (`/admin/dashboard`)
- Overview of platform statistics
- Total users, students, tutors, parents
- Recent signups (last 7 days)
- Total sessions and bookings
- Quick access to all admin features

### **Email Management** (`/admin/emails`)
**Full email system with 3 tabs:**

1. **Send Email Tab**
   - Compose custom emails
   - Select recipients from mailing list
   - Preview before sending
   - Personalization with `{{firstName}}`
   - Sends from `hello@myitutor.com`

2. **Email Templates Tab**
   - Create & save reusable templates
   - Edit existing templates
   - Organize by user type (student/tutor/parent)
   - Set stage for onboarding sequences
   - One-click use in compose

3. **Mailing List Tab**
   - Filter by user type (All, Students, Tutors, Parents)
   - Filter by join date (from/to range)
   - Select individual or all users
   - View user details table
   - Export to Send Email tab

### **User Management** (`/admin/users`)
*Coming soon - placeholder page ready*

### **System Settings** (`/admin/system`)
*Coming soon - placeholder page ready*

## 🚀 Quick Start Guide

### Step 1: Setup Admin Account
```sql
-- Run in Supabase SQL Editor
UPDATE profiles 
SET role = 'admin'
WHERE email = 'admin@myitutor.com';
```

### Step 2: Setup Email System
1. Run `CREATE_EMAIL_TEMPLATES_TABLE.sql` in Supabase
2. Verify domain `myitutor.com` in Resend
3. Update `.env.local`:
   ```env
   RESEND_API_KEY=your_key
   RESEND_FROM_EMAIL=iTutor <hello@myitutor.com>
   ```
4. Restart dev server

### Step 3: Access Admin Dashboard
1. Navigate to `http://localhost:3000/login`
2. Log in with `admin@myitutor.com`
3. You'll be redirected to `/admin/dashboard`
4. Click "Email Management" to start sending emails

## 📧 Email Management Features

### **Sending Bulk Emails**
1. Go to "Mailing List" tab
2. Apply filters (user type, date range)
3. Select users (individual or all)
4. Click "Compose Email to X Users"
5. Write subject and HTML content
6. Preview email
7. Send

### **Using Templates**
1. Go to "Email Templates" tab
2. Create a new template with:
   - Name (internal reference)
   - User type (student/tutor/parent)
   - Stage (0-7 for onboarding days)
   - Subject line
   - HTML content
3. Save template
4. Use in "Send Email" tab by clicking "Use Template"

### **Personalization**
Use `{{firstName}}` in your email content, and it will automatically be replaced with each recipient's first name:

```html
<p>Hi {{firstName}},</p>
<p>Welcome to iTutor!</p>
```

### **Email Best Practices**
- ✅ Always preview before sending
- ✅ Test with yourself first
- ✅ Start with small groups (10-20 users)
- ✅ Use personalization for better engagement
- ✅ Include clear call-to-action buttons
- ✅ Make emails mobile-friendly
- ✅ Monitor deliverability in Resend dashboard

## 📂 File Structure

### **Admin Pages**
```
app/admin/
├── dashboard/
│   └── page.tsx          # Admin dashboard with stats
├── emails/
│   └── page.tsx          # Email management system
├── users/
│   └── page.tsx          # User management (coming soon)
└── system/
    └── page.tsx          # System settings (coming soon)
```

### **API Routes**
```
app/api/admin/
├── users/
│   └── route.ts          # GET filtered user list
├── send-email/
│   └── route.ts          # POST bulk email sending
└── email-templates/
    └── route.ts          # GET/POST/PUT email templates
```

### **Database**
```
CREATE_EMAIL_TEMPLATES_TABLE.sql  # Create templates table
SETUP_ADMIN_ACCOUNT.sql          # Setup admin user
```

### **Documentation**
```
ADMIN_COMPLETE_GUIDE.md          # This file
ADMIN_EMAIL_SYSTEM_GUIDE.md      # Detailed email guide
ADMIN_EMAIL_SETUP_CHECKLIST.md   # Setup checklist
```

## 🔒 Security Features

### **Admin-Only Access**
- All admin routes check for `role = 'admin'`
- Non-admin users are redirected to login
- RLS policies enforce admin-only database access

### **Email Templates Table**
- Admin-only SELECT, INSERT, UPDATE, DELETE policies
- Automatic `updated_at` timestamp
- Indexed for performance

### **API Security**
- All admin API routes verify admin authentication
- Service role key used for RLS bypass where needed
- Rate limiting recommended for production

## 📊 Dashboard Statistics

The admin dashboard displays:

1. **Total Users** - All registered users
2. **Students** - Student accounts
3. **iTutors** - Tutor accounts
4. **Recent Signups** - New users in last 7 days
5. **Parents** - Parent accounts
6. **Total Sessions** - All completed sessions
7. **Total Bookings** - All booking requests

## 🎯 Common Admin Tasks

### **1. Send Welcome Email to New Users**
```
1. Go to Mailing List
2. Filter: User Type = "All", Joined From = "last week"
3. Select all
4. Compose welcome email
5. Send
```

### **2. Send Announcement to All Students**
```
1. Go to Mailing List
2. Filter: User Type = "Students"
3. Select all
4. Compose announcement
5. Send
```

### **3. Create Onboarding Email Sequence**
```
1. Go to Email Templates
2. Create 5 templates (Stage 0, 1, 3, 5, 7)
3. Set appropriate user type for each
4. Save all templates
5. Use cron job to automate sending (see docs)
```

### **4. Send Targeted Campaign to Inactive Users**
```
1. Go to Mailing List
2. Filter: Joined From = "30 days ago", Joined To = "60 days ago"
3. Select all
4. Compose re-engagement email
5. Send
```

## 🛠️ Troubleshooting

### **Can't access admin dashboard**
- Verify role is 'admin' in profiles table
- Log out and log back in to refresh session
- Check browser console for errors

### **Emails not sending**
- Verify Resend API key is correct
- Check domain is verified in Resend dashboard
- Ensure `hello@myitutor.com` is verified sender
- Check console logs for specific errors

### **Templates not saving**
- Verify admin authentication
- Check RLS policies on email_templates table
- Look for SQL errors in browser console

### **Users not loading in mailing list**
- Check Supabase connection
- Verify RLS policies on profiles table
- Check browser network tab for API errors

## 📈 Future Enhancements

Planned features for admin dashboard:

1. **User Management**
   - View all users in detail
   - Suspend/activate accounts
   - Edit user profiles
   - View user activity logs

2. **System Settings**
   - Configure platform fees
   - Manage payment settings
   - Platform-wide announcements
   - Email notification settings

3. **Analytics**
   - User growth charts
   - Revenue tracking
   - Session statistics
   - Email campaign analytics

4. **Automated Campaigns**
   - Schedule emails in advance
   - Drip campaigns
   - Triggered emails (e.g., after booking)
   - A/B testing

## 🆘 Support

For issues or questions:
- **Technical Support:** hello@myitutor.com
- **Resend Docs:** https://resend.com/docs
- **Email Templates:** See `ADMIN_EMAIL_SYSTEM_GUIDE.md`
- **Setup Help:** See `ADMIN_EMAIL_SETUP_CHECKLIST.md`

## 📝 Quick Reference

| Task | Location | Action |
|------|----------|--------|
| View stats | `/admin/dashboard` | Dashboard home |
| Send emails | `/admin/emails` → Send Email | Select users, compose, send |
| Create template | `/admin/emails` → Templates | New Template, fill fields, save |
| Filter users | `/admin/emails` → Mailing List | Apply filters, select users |
| Check deliverability | Resend Dashboard | Monitor bounces/spam |

---

**Last Updated:** 2026-02-03  
**Admin Account:** admin@myitutor.com  
**Platform:** iTutor - Quality Caribbean Education
