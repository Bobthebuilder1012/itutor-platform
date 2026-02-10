# Email Management System - Complete Setup Guide

## Overview
The Email Management system allows the admin to store, edit, and send customized emails to filtered user groups. All email templates are stored in the database and can be managed through the admin interface.

## Step 1: Create Email Templates Table

Run this SQL script in Supabase SQL Editor:

```sql
-- This creates the email_templates table and sets up RLS policies
-- File: CREATE_EMAIL_TEMPLATES_TABLE.sql
```

This creates:
- `email_templates` table to store all email templates
- RLS policies to restrict access to admin users only

## Step 2: Populate Email Templates

Run this SQL script to add all existing email templates to the database:

```sql
-- This populates the email_templates table with student and tutor onboarding emails
-- File: POPULATE_EMAIL_TEMPLATES.sql
```

This will add:
- **3 Student Templates**: Welcome, Day 1, Day 3
- **2 Tutor Templates**: Welcome, Day 1

## Step 3: Access Email Management

1. Log in as admin at: `admin@myitutor.com`
2. Navigate to: `/admin/emails`
3. You'll see three tabs:
   - **Send Email**: Compose and send emails to selected users
   - **Templates**: View, edit, create, and delete email templates
   - **Mailing List**: Browse and filter all users to select recipients

## Features

### Send Email Tab
- Compose custom emails with HTML content
- Use `{{firstName}}` placeholder for personalization
- Preview emails before sending
- Send to selected users from mailing list
- Load templates directly into the composer

### Templates Tab
- **View All Templates**: See all saved email templates with type and stage
- **Create New Template**: Add custom templates for different user types
- **Edit Template**: Modify existing templates
- **Use Template**: Load template into Send Email tab for immediate use
- **Delete Template**: Remove templates you no longer need

### Mailing List Tab
- **Filter by Role**: Students, Tutors, Parents, or all users
- **Filter by Join Date**: Select users who joined in a date range
- **Search Users**: Find specific users by name or email
- **Select Recipients**: Choose individual users or select all filtered users
- **View Selection Count**: See how many users are selected

## Email Template Structure

Each template includes:
- **Name**: Descriptive name (e.g., "Student Welcome Email")
- **Subject**: Email subject line (supports `{{firstName}}`)
- **HTML Content**: Full HTML email body (supports `{{firstName}}`)
- **User Type**: student, tutor, parent (for organization)
- **Stage**: Day number (0, 1, 3, etc.) for onboarding sequences

## Personalization

Use `{{firstName}}` anywhere in your subject or content:
- It will be replaced with the user's `display_name`
- Falls back to first word of `full_name` if display_name is not set
- Example: `"Welcome {{firstName}}!"` → `"Welcome John!"`

## Email Sending

All emails are sent from: **iTutor <hello@myitutor.com>**

Process:
1. Select recipients from Mailing List tab
2. Go to Send Email tab (selection carries over)
3. Load a template OR compose custom email
4. Click "Send to X Users"
5. System personalizes and sends to each recipient

## Security

- Only users with `role = 'admin'` can access email management
- All API routes verify admin status
- RLS policies protect the email_templates table
- Failed sends are logged with detailed error messages

## Best Practices

1. **Test First**: Send to a test user before bulk sending
2. **Preview Always**: Use the preview feature to check formatting
3. **Use Templates**: Save frequently used emails as templates
4. **Personalize**: Always use `{{firstName}}` for better engagement
5. **Filter Carefully**: Double-check mailing list filters before sending
6. **Keep Records**: Templates are stored in database, not code

## Troubleshooting

### Templates Not Showing
- Verify `email_templates` table exists
- Check if `POPULATE_EMAIL_TEMPLATES.sql` was run
- Confirm you're logged in as admin

### Email Not Sending
- Check Resend API key in environment variables
- Verify `RESEND_FROM_EMAIL` is set to `iTutor <hello@myitutor.com>`
- Check browser console for error messages
- Verify recipients are selected

### Personalization Not Working
- Ensure you're using `{{firstName}}` (case-sensitive)
- Check that users have `display_name` or `full_name` set
- Preview the email to see the output

## File Structure

```
app/
├── admin/
│   └── emails/
│       └── page.tsx                    # Main email management UI
├── api/
│   └── admin/
│       ├── send-email/
│       │   └── route.ts               # Bulk email sending API
│       ├── email-templates/
│       │   ├── route.ts               # Templates CRUD (GET, POST, PUT, DELETE)
│       │   └── [id]/
│       │       └── route.ts           # Delete specific template
│       └── accounts/
│           └── route.ts               # User fetching with filters

SQL Scripts:
├── CREATE_EMAIL_TEMPLATES_TABLE.sql   # Database setup
└── POPULATE_EMAIL_TEMPLATES.sql       # Load initial templates
```

## Next Steps

After setup:
1. ✅ Run `CREATE_EMAIL_TEMPLATES_TABLE.sql`
2. ✅ Run `POPULATE_EMAIL_TEMPLATES.sql`
3. ✅ Login as admin
4. ✅ Navigate to `/admin/emails`
5. ✅ Verify templates are loaded
6. ✅ Test by sending to yourself
7. ✅ Start using the system!

## Support

For issues or questions:
- Check browser console for errors
- Review Supabase logs for backend errors
- Verify environment variables are set correctly
- Contact technical support with error details
