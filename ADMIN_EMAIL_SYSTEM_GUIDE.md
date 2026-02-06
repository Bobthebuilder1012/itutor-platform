# Admin Email Management System

## Overview
The admin email management system allows you to send emails, manage templates, and maintain mailing lists for all platform users (students, tutors, and parents).

## Setup Instructions

### 1. Database Setup
Run the SQL migration to create the email_templates table:

```sql
-- Run this in Supabase SQL Editor
-- File: CREATE_EMAIL_TEMPLATES_TABLE.sql
```

This creates:
- `email_templates` table for storing custom email templates
- RLS policies (admin-only access)
- Indexes for fast queries
- Automatic `updated_at` timestamp trigger

### 2. Environment Configuration
Ensure your `.env.local` has:

```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=iTutor <hello@myitutor.com>
```

**Important:** The domain `myitutor.com` must be verified in your Resend account.

### 3. Verify Domain in Resend
1. Log in to Resend dashboard
2. Go to "Domains"
3. Add `myitutor.com`
4. Add the provided DNS records to your domain
5. Wait for verification (usually takes a few minutes)

## Features

### 1. Send Email Tab
**Purpose:** Compose and send custom emails to selected users

**Features:**
- Compose custom subject and HTML content
- Select recipients from mailing list
- Preview email before sending
- Personalization with `{{firstName}}` placeholder
- Sends from `hello@myitutor.com`

**How to use:**
1. Click "Select Recipients" to go to mailing list
2. Select users using checkboxes
3. Return to "Send Email" tab
4. Write subject and HTML content
5. Use `{{firstName}}` in content to personalize (will be replaced with user's first name)
6. Click "Preview" to see how email will look
7. Click "Send to X Users" to send

### 2. Email Templates Tab
**Purpose:** Create, edit, and manage reusable email templates

**Features:**
- Create new templates
- Edit existing templates
- Organize by user type (student, tutor, parent)
- Set stage/day for onboarding sequences
- Use saved templates in "Send Email" tab

**Template Fields:**
- **Name:** Internal identifier (e.g., "Welcome Email - Student")
- **User Type:** Student, Tutor, or Parent
- **Stage:** Day number (0 = welcome, 1 = day 1, etc.)
- **Subject:** Email subject line
- **HTML Content:** Full HTML email body

**How to use:**
1. Click "New Template" to create
2. Fill in all fields
3. Click "Save Template"
4. To edit: Click "Edit" on any template
5. To use: Click "Use Template" (copies to Send Email tab)

### 3. Mailing List Tab
**Purpose:** View, filter, and select users for email campaigns

**Features:**
- Filter by user type (All, Students, Tutors, Parents)
- Filter by join date range
- Select individual users or all users
- View user details (name, email, type, join date)

**How to use:**
1. Select filters (user type, date range)
2. Click "Apply Filters"
3. Use "Select All" or check individual users
4. Click "Compose Email to X Users" to proceed to send tab

## Email Content Guidelines

### HTML Structure
All emails should follow this structure:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Your styles here */
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: #000000; padding: 30px 0; text-align: center;">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height: 60px;" />
    </div>
    <div class="content" style="background: #ffffff; padding: 40px;">
      <h1>Title Here</h1>
      <p>Content here with {{firstName}} personalization</p>
      <a href="https://myitutor.com/..." style="display: inline-block; background: #199358; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none;">
        Call to Action
      </a>
    </div>
    <div class="footer" style="text-align: center; padding: 30px 0; color: #6b7280;">
      <!-- Social links and copyright -->
    </div>
  </div>
</body>
</html>
```

### Personalization Variables
- `{{firstName}}` - User's first name (automatically replaced)

### Best Practices
1. **Always include unsubscribe link** (if required by your jurisdiction)
2. **Use responsive design** - emails should work on mobile
3. **Test before sending** - use preview feature
4. **Brand consistency** - use iTutor colors (#199358 for green)
5. **Clear CTAs** - one primary action per email
6. **Professional tone** - friendly but formal

## Common Use Cases

### 1. Welcome Campaign
Create templates for each stage:
- Stage 0: Welcome email
- Stage 1: Day 1 follow-up
- Stage 3: Day 3 tips
- Stage 5: Day 5 engagement
- Stage 7: Day 7 check-in

### 2. Announcement to All Users
1. Go to Mailing List
2. Set "User Type" to "All Users"
3. Click "Select All"
4. Compose announcement email
5. Send

### 3. Targeted Campaign (e.g., New Tutors)
1. Go to Mailing List
2. Set "User Type" to "Tutors"
3. Set "Joined From" to last week
4. Apply filters
5. Select all
6. Send onboarding tips

### 4. Re-engagement Campaign
1. Filter users by date range (e.g., joined 30-60 days ago)
2. Select users
3. Send re-engagement email with special offer

## Security

### Admin Access Only
- All email features require admin authentication
- RLS policies enforce admin-only access to templates and user data
- Non-admin users cannot access `/admin/emails`

### Rate Limiting
Consider implementing rate limiting in production to prevent:
- Spam complaints
- Resend API quota exhaustion
- Accidental bulk sends

## Monitoring

### Email Delivery
Monitor in Resend dashboard:
- Delivery rate
- Bounce rate
- Spam complaints
- Failed sends

### Best Practices
1. Keep mailing lists clean (remove bounced emails)
2. Don't send more than 1-2 emails per week per user
3. Monitor engagement (opens, clicks)
4. A/B test subject lines

## Troubleshooting

### Emails not sending
1. Check RESEND_API_KEY is set correctly
2. Verify domain in Resend dashboard
3. Check console logs for errors
4. Ensure `hello@myitutor.com` is verified sender

### Templates not saving
1. Check admin authentication
2. Verify RLS policies are set correctly
3. Check database connection
4. Look for SQL errors in logs

### Users not appearing in mailing list
1. Verify users have email addresses
2. Check user_type filter
3. Verify date filters are correct
4. Check RLS policies on profiles table

## API Reference

### GET /api/admin/users
**Query Parameters:**
- `userType`: 'all' | 'student' | 'tutor' | 'parent'
- `dateFrom`: ISO date string (YYYY-MM-DD)
- `dateTo`: ISO date string (YYYY-MM-DD)

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "user_type": "student",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/admin/send-email
**Body:**
```json
{
  "userIds": ["uuid1", "uuid2"],
  "subject": "Email subject",
  "htmlContent": "<html>...</html>"
}
```

**Response:**
```json
{
  "sent": 2,
  "failed": 0,
  "failedEmails": [],
  "message": "Successfully sent 2 out of 2 emails"
}
```

### GET /api/admin/email-templates
**Response:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "Welcome Email",
      "subject": "Welcome!",
      "html_content": "<html>...</html>",
      "user_type": "student",
      "stage": 0,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/admin/email-templates
**Body:**
```json
{
  "name": "Welcome Email",
  "subject": "Welcome to iTutor!",
  "html_content": "<html>...</html>",
  "user_type": "student",
  "stage": 0
}
```

### PUT /api/admin/email-templates
**Body:**
```json
{
  "id": "uuid",
  "name": "Updated Name",
  "subject": "Updated Subject",
  "html_content": "<html>...</html>",
  "user_type": "student",
  "stage": 0
}
```

## Support
For issues or questions:
- Technical support: hello@myitutor.com
- Resend documentation: https://resend.com/docs
