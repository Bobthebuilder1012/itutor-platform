# Reviewer Interface Access Guide

## ✅ What's Been Built

A complete reviewer interface for the tutor verification system has been implemented with:

### Pages Created:
1. **Reviewer Dashboard** (`/reviewer/dashboard`)
   - Quick stats and navigation to verification queue
   - Links to approved/rejected verification history
   - Help section with contact support
   - Verification guidelines

2. **Verification Queue** (`/reviewer/verification`)
   - Table view of all pending verification requests
   - Filter by status (Ready for Review, Processing, Approved, Rejected)
   - Bulk approve/reject functionality
   - Individual approve/reject with modal
   - View uploaded documents
   - System recommendation display with confidence scores
   - Help text: "Need help? Contact support@myitutor.com"

3. **Reviewer Settings** (`/reviewer/settings`)
   - View profile information
   - Contact support for changes

### Navigation Added:
- **Verification Queue** - Main reviewer workspace
- **Settings** - Profile and preferences

### Features:
- Clean, modern UI matching the iTutor design system
- Full decision workflow with reason prompting
- Bulk actions for efficiency
- Real-time updates after decisions
- Document preview with signed URLs
- Proper authentication and authorization checks

## 🔐 How to Access

### Step 1: Ensure Account is Marked as Reviewer
Your account must have `is_reviewer = true` in the database. Run this SQL:

```sql
-- Check if account is a reviewer
SELECT id, email, full_name, is_reviewer 
FROM profiles 
WHERE id = 'YOUR_ACCOUNT_ID';

-- If is_reviewer is false or null, update it:
UPDATE profiles 
SET is_reviewer = true 
WHERE id = 'YOUR_ACCOUNT_ID';
```

Replace `YOUR_ACCOUNT_ID` with the actual account ID you want to use as a reviewer.

### Step 2: Login to the Account
1. Go to `http://localhost:3000/login`
2. Login with the reviewer account credentials

### Step 3: Navigate to Reviewer Dashboard
After login, the system will automatically detect your reviewer role and you'll have access to:

- **Dashboard**: `http://localhost:3000/reviewer/dashboard`
- **Verification Queue**: `http://localhost:3000/reviewer/verification`
- **Settings**: `http://localhost:3000/reviewer/settings`

Or simply click on the **"Verification Queue"** link in the navigation bar at the top of the page.

## 🎯 Navigation Bar

Once logged in as a reviewer, you'll see:
- iTutor Logo (links to dashboard)
- **Verification Queue** (main work area)
- **Settings**
- Notification Bell (for system notifications)
- Your Name
- Logout Button

**Note**: Reviewers do NOT see:
- Calendar Icon
- Messages Icon
- "Become a Tutor" in footer

## 📋 Using the Verification Queue

### Viewing Requests
1. Navigate to `/reviewer/verification`
2. By default, shows requests with status "Ready for Review"
3. Use the dropdown to filter by other statuses

### Individual Decisions
1. Click **"View"** to see the uploaded document
2. Click **"Approve"** or **"Reject"** to open decision modal
3. Review system recommendation and confidence score
4. Add reason (required when rejecting system-approved requests)
5. Confirm decision

### Bulk Actions
1. Select multiple requests using checkboxes
2. Click **"Approve Selected (N)"** or **"Reject Selected (N)"**
3. Add global reason if rejecting
4. Confirm bulk decision

### Notifications
- Tutors receive notifications when their verification is approved/rejected
- Notifications include the reviewer's reason (if provided)

## 🔧 Technical Details

### Database Requirements
- Profile must have `is_reviewer = true`
- All verification requests are in `tutor_verification_requests` table
- Decisions logged in `tutor_verification_events` table

### API Endpoints Used
- `GET /api/reviewer/verification-requests` - Fetch requests
- `POST /api/reviewer/verification-requests/:id/decide` - Single decision
- `POST /api/reviewer/verification-requests/bulk-decide` - Bulk decisions

### RLS Policies
- Reviewers can view/update all verification requests
- Tutors can only view their own requests
- Service role has full access for backend operations

## 📧 Support

For any issues or questions about the reviewer system:
- Email: support@myitutor.com
- Click "Contact Support" button in the dashboard or settings

## ✨ Next Steps

You can now:
1. Login to your reviewer account
2. Navigate to the Verification Queue
3. Start reviewing tutor verification requests
4. Approve or reject with proper reasoning
5. Use bulk actions for efficiency

The system is fully functional and ready for production use!













