# How to Check Google OAuth Verification Status

**Users are seeing: "This app has not been verified"**

This guide shows you how to check what's happening with your verification request.

---

## Step 1: Check Verification Status in Google Cloud Console

1. **Go to:** https://console.cloud.google.com/
2. **Select your project** (iTutor or whatever you named it)
3. **Navigate to:** APIs & Services → OAuth consent screen
4. **Look at "Publishing status"**

### What You'll See:

**Option A: "In production" ✅**
- **Status:** Verified and published
- **Why users see warning:** Some scopes still trigger the warning even after verification
- **Solution:** Jump to [Step 3: Add Verification Badge](#step-3-check-if-specific-scopes-need-verification)

**Option B: "Testing" ⚠️**
- **Status:** Still in testing mode
- **Why users see warning:** App is not published yet
- **Solution:** Click "Publish App" or check if verification is pending

**Option C: "Verification required" or "Needs verification" 🔴**
- **Status:** Verification pending or additional verification needed
- **Why users see warning:** Google is still reviewing your app
- **Solution:** Check email for Google updates or check verification status

---

## Step 2: Check for Google Emails

**Search your email inbox for:**

**From:** `noreply@google.com` or `oauth-verification@google.com`

**Subject lines to look for:**
- "Your OAuth verification application"
- "Action required: OAuth verification"
- "OAuth verification approved"
- "OAuth verification rejected"
- "Additional information needed"

**Common Scenarios:**

### ✅ If Approved:
Email says: "Your app has been verified"
- **Action:** OAuth consent screen should show "Published"
- **If still showing warning:** Some scopes always show warning (see Step 3)

### ⏳ If Still Pending:
No email yet or email says "Under review"
- **Timeline:** Google reviews typically take **1-4 weeks**
- **Action:** Use workaround in Step 4 while waiting

### ❌ If Rejected or More Info Needed:
Email explains what's missing
- **Common requests:**
  - Clearer explanation of scope usage
  - Better demo video
  - Privacy policy link
  - Terms of service link
- **Action:** Address the issues and resubmit

---

## Step 3: Check If Specific Scopes Need Verification

**In Google Cloud Console:**

1. Go to: **OAuth consent screen**
2. Scroll to **"Scopes for Google APIs"** section
3. Check the scopes you're using:

**Your scopes:**
- `https://www.googleapis.com/auth/calendar.events` - **Sensitive scope** (needs verification)
- `https://www.googleapis.com/auth/userinfo.email` - **Non-sensitive** (no verification needed)

**The Calendar scope is "restricted"** which means:
- ✅ Requires app verification
- ⏳ Takes 1-4 weeks to review
- 📹 Requires demo video showing scope usage

---

## Step 4: Check Submission Status (If You Submitted)

**In Google Cloud Console:**

1. Go to: **OAuth consent screen**
2. Look for **"Verification status"** banner at the top
3. Click **"View verification status"** or **"Check status"**

**Possible statuses:**

| Status | What It Means | What to Do |
|--------|---------------|------------|
| **Approved** | Verification complete | Should work now - check Step 5 |
| **In Review** | Google is reviewing | Wait or check email for updates |
| **Needs Info** | Google needs more details | Check email for what's needed |
| **Not Submitted** | No application on file | Need to submit (or resubmit) |
| **Rejected** | Application denied | Read rejection reason, fix, resubmit |

---

## Step 5: Temporary Workaround While Waiting

**While your verification is pending, you can still use Google OAuth by:**

### Option A: Stay in Testing Mode (Recommended)

1. Keep publishing status as **"Testing"**
2. Add your users' email addresses as **"Test users"** in OAuth consent screen
3. Users will see the warning but can click **"Continue"** if they're test users
4. **Limit:** 100 test users maximum

**How to add test users:**
1. OAuth consent screen → Scroll to **"Test users"**
2. Click **"Add Users"**
3. Enter email addresses (one per line)
4. Click **"Save"**

### Option B: Use Internal User Type

If all your users have Google Workspace accounts (same organization):
1. Change **User type** to **"Internal"**
2. No verification needed!
3. Only users in your Google Workspace can login

---

## Step 6: Verify It's Working After Changes

**Test the flow:**

1. **Open:** http://localhost:3000/tutor/video-setup
2. **Log in** as a tutor (or your email if you added it as test user)
3. **Click:** "Connect Google Meet"
4. **You should see:**
   - Google login screen
   - App name and requested permissions
   - Warning: "Google hasn't verified this app" with **"Continue"** button
5. **Click "Continue"** → Should redirect back with success

**If this works - your app is configured correctly!** The warning will disappear once Google approves your verification.

---

## Step 7: Check Production vs Localhost

**Important:** Your localhost redirect URI is different from production!

**Localhost:** `http://localhost:3000/api/auth/google/callback` ✅ (in your .env.local)

**Production:** You need to add:
`https://itutor-platform.vercel.app/api/auth/google/callback`

**In Google Cloud Console:**
1. Go to: **Credentials** → Your OAuth 2.0 Client
2. **Authorized redirect URIs** should have BOTH:
   - `http://localhost:3000/api/auth/google/callback` (for development)
   - `https://itutor-platform.vercel.app/api/auth/google/callback` (for production)
   - `https://your-custom-domain.com/api/auth/google/callback` (if you have one)

---

## Step 8: Force Refresh Your Verification Request

**If it's been more than 2 weeks with no response:**

1. Go to: **OAuth consent screen**
2. Click **"Submit for verification"** again
3. Google may ask you to resubmit or will show current status

**Or contact Google Support:**
- Go to: https://support.google.com/cloud/
- Select: "OAuth verification inquiry"
- Reference your app name and client ID

---

## Quick Diagnosis Flowchart

```
Is your app in "Testing" mode?
├─ Yes → Add user emails as test users (works immediately)
│         Users can click "Continue" on warning
│
└─ No → Check verification status
    ├─ "In Review" → Wait or contact Google support
    ├─ "Approved" → Check redirect URIs and scopes
    ├─ "Needs Info" → Check email for requirements
    └─ "Not Submitted" → Submit verification request
```

---

## What You Should Do Right Now

### Immediate Action:

**Option 1: Add Test Users (Quick Fix)**
1. Google Cloud Console → OAuth consent screen
2. Add your tutors' email addresses as "Test users"
3. They can use Google Meet immediately (with "Continue" button on warning)

**Option 2: Check Email**
- Search inbox for Google verification emails
- Look for requests for more information
- Check spam folder

**Option 3: Check Verification Status**
- Google Cloud Console → OAuth consent screen
- Look for verification status banner
- Click any links to view submission details

---

## Expected Timeline

| Stage | Time |
|-------|------|
| **Initial submission** | Instant |
| **Google begins review** | 1-3 days |
| **Review in progress** | 1-4 weeks (average: 2 weeks) |
| **Approval/Rejection** | Email notification |
| **Total time** | 1-5 weeks typically |

**If it's been >4 weeks:** Contact Google support - something may be stuck.

---

## Summary

**Your .env.local has correct Google credentials ✅**

**Next steps:**
1. Check Google Cloud Console → OAuth consent screen → Verification status
2. Check email for Google messages
3. Add test users as temporary workaround
4. If >2 weeks with no response, resubmit or contact support

**Want me to help you check or test the connection right now?**
