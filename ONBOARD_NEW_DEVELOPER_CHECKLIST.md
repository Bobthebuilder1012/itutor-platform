# Team Lead Checklist: Onboarding New Developer

**Use this checklist when adding a new developer to the iTutor platform.**

---

## Before They Start

### Step 1: Get Their Information
- [ ] GitHub username
- [ ] Email address
- [ ] Preferred communication method (Discord, Slack, email, phone)

---

## Access & Credentials

### Step 2: Grant GitHub Access
1. Go to: https://github.com/Bobthebuilder1012/itutor-platform
2. Click **Settings** → **Collaborators**
3. Click **Add people**
4. Enter their GitHub username or email
5. Select **Write** access (not Admin)
6. They'll receive an email invitation

---

### Step 3: Prepare `.env.local` Credentials

**Copy this template and fill in the actual values from YOUR `.env.local` file:**

```env
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>

GOOGLE_CLIENT_ID=<your_google_client_id>
GOOGLE_CLIENT_SECRET=<your_google_client_secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

ZOOM_CLIENT_ID=<your_zoom_client_id>
ZOOM_CLIENT_SECRET=<your_zoom_client_secret>
ZOOM_REDIRECT_URI=http://localhost:3000/api/auth/zoom/callback

TOKEN_ENCRYPTION_KEY=<your_token_encryption_key>

RESEND_API_KEY=<your_resend_api_key>
RESEND_FROM_EMAIL=iTutor <hello@myitutor.com>

CRON_SECRET=<your_cron_secret>

PAID_CLASSES_ENABLED=false

NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your_vapid_public_key>
VAPID_PRIVATE_KEY=<your_vapid_private_key>
VAPID_SUBJECT=mailto:admin@myitutor.com
```

**⚠️ Send this securely:**
- Use encrypted email, password manager, or secure file sharing
- Never post in public channels (Discord, Slack, email subject lines)
- Consider using: https://onetimesecret.com/ for one-time secret sharing

---

### Step 4: Grant Supabase Dashboard Access (Optional)

**If you want them to view/edit the database:**

1. Go to: https://supabase.com/dashboard
2. Open your iTutor project
3. Click **Settings** → **Organization** → **Team**
4. Click **Invite** → Enter their email
5. Select role: **Developer** (not Owner)

**Note:** They can develop without dashboard access using just the API keys.

---

### Step 5: Grant Vercel Access (Optional)

**If you want them to view deployments and logs:**

1. Go to: https://vercel.com/dashboard
2. Select iTutor project
3. Click **Settings** → **Members**
4. Click **Invite** → Enter their email
5. Select role: **Developer** (not Owner)

---

## Share Documentation

### Step 6: Send Them These Files

**Required:**
- [ ] `NEW_DEVELOPER_SETUP_GUIDE.md` (the guide I just created)
- [ ] `.env.local` credentials (prepared in Step 3)

**Helpful (but optional):**
- [ ] `docs/RUNBOOK.md` - Operations guide
- [ ] `docs/CTO_HANDOVER.md` - Architecture overview

**How to send:**
1. Email the setup guide as attachment
2. Send credentials separately via secure method
3. Include repository URL: `https://github.com/Bobthebuilder1012/itutor-platform`

---

## First Contact Script

**Here's a message template you can send:**

---

**Subject:** Welcome to iTutor Development Team - Setup Guide

Hey [Name],

Welcome to the team! I'm excited to have you working on iTutor with us.

**Getting Started:**

1. **Setup Guide:** I've attached `NEW_DEVELOPER_SETUP_GUIDE.md` - this walks you through installing everything you need (Git, Node.js, code editor) and getting the project running on your computer.

2. **Repository Access:** I've invited you to the GitHub repository. Check your email for the invitation and accept it.
   - Repository: https://github.com/Bobthebuilder1012/itutor-platform

3. **Environment Variables:** I'm sending the `.env.local` credentials separately (check your email). You'll need these to connect to our database and services.

**What to Do:**

1. Follow the setup guide step-by-step
2. Let me know when you get to Step 5 (environment variables)
3. Once your local server is running at http://localhost:3000, message me
4. I'll assign you your first task

**Estimated Setup Time:** 45-60 minutes

**Important Rules:**
- ⚠️ Never push to the `main` branch (goes to production immediately)
- ✅ Always work on the `dev` branch
- ✅ Test your changes locally before committing

Let me know if you run into any issues during setup!

Best,
[Your Name]

---

---

## During Their Setup (Be Available For)

### Common Questions:
- "Where do I put the `.env.local` file?" 
  → Root of the project folder (same level as `package.json`)
  
- "The server won't start" 
  → Check they ran `npm install` first
  
- "I see errors in the console" 
  → Ask for screenshots, likely environment variable issues
  
- "Which branch should I work on?"
  → `dev` branch for all development work

---

## After Setup Verification

### Step 7: Verify They're Set Up

Ask them to send you:
- [ ] Screenshot of `http://localhost:3000` loading successfully
- [ ] Screenshot of their Git branch: `git branch`
- [ ] Confirmation they can see the communities page

---

### Step 8: Assign First Task

**Recommended First Tasks (Easy):**
- [ ] Fix a small UI bug or text change
- [ ] Add a new button or component
- [ ] Update styling on an existing page
- [ ] Add a new page route

**Example:**
"For your first task, can you add a 'Coming Soon' badge to the Communities page header? Make the changes on the `dev` branch and push when done. I'll review your code and provide feedback."

---

## Branch Protection Rules

### To Prevent Accidents:

**On GitHub:**
1. Repository → Settings → Branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Check ✅ "Require pull request before merging"
5. Check ✅ "Require approvals" (set to 1)
6. Save

**This prevents anyone (including you) from accidentally pushing to `main`.**

---

## Ongoing Communication

### Set Up Regular Check-ins:
- [ ] Daily standups (async or sync)
- [ ] Weekly code reviews
- [ ] Shared task board (GitHub Projects, Trello, etc.)

### Communication Channels:
- **Quick questions:** Discord/Slack/WhatsApp
- **Code reviews:** GitHub Pull Requests
- **Documentation:** Update guides as you learn

---

## Summary: What You Need to Do

1. ✅ Get their GitHub username
2. ✅ Invite them to the repository (GitHub → Settings → Collaborators)
3. ✅ Send them `NEW_DEVELOPER_SETUP_GUIDE.md`
4. ✅ Send them `.env.local` credentials (securely)
5. ✅ Be available during their setup (45-60 min)
6. ✅ Verify they can run localhost successfully
7. ✅ Assign first task
8. ✅ Set up branch protection on `main` (optional but recommended)

---

**That's it! Your new team member will be up and running soon. 🚀**
