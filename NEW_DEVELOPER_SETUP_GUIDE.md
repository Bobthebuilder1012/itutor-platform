# iTutor Platform - New Developer Setup Guide

**Welcome to the iTutor development team!** 🎉

This guide will get you up and running quickly. We use **Cursor AI** to automate most of the tedious work, so you can focus on building features instead of fighting with setup.

**Estimated Setup Time:** 20-30 minutes

---

## Table of Contents

1. [Install Software (One-Time Setup)](#1-install-software-one-time-setup)
2. [Get Access & Clone Repository](#2-get-access--clone-repository)
3. [Setup Environment with Cursor AI](#3-setup-environment-with-cursor-ai)
4. [Start Coding](#4-start-coding)
5. [Daily Workflow](#5-daily-workflow)
6. [Quick Troubleshooting](#6-quick-troubleshooting)

---

## 1. Install Software (One-Time Setup)

**You need 3 things. Just download and install with default settings - that's it!**

### ✅ Cursor IDE (AI Code Editor)
**Download:** https://cursor.sh/

**Why Cursor?**
- AI assistant built-in (does setup work for you!)
- Team uses this for all development
- Makes coding way easier

**Installation:** Download → Run installer → Done

---

### ✅ Node.js (JavaScript Runtime)
**Download:** https://nodejs.org/ (get the LTS version)

**What it does:** Runs the development server

**Installation:** Download → Run installer → Accept defaults → Done

---

### ✅ Git (Version Control)
**Download:** https://git-scm.com/downloads

**What it does:** Tracks code changes and syncs with team

**Installation:** Download → Run installer → Accept defaults → Done

---

**That's it for software!** You don't need anything else. No GitHub Desktop, no VS Code, no extra tools.

---

## 2. Get Access & Clone Repository

### 2.1 Get GitHub Access

**You'll receive an email invitation - accept it.**

---

### 2.2 Environment Credentials

Will be sent

---

### 2.3 Clone the Repository with Cursor

**Now the fun part - let Cursor AI do the work!**

1. **Open Cursor**

2. **Open Terminal in Cursor:**
   - Press `` Ctrl+` `` (backtick key)
   - Or: View → Terminal

3. **Tell Cursor AI to clone the repo:**
   - Press `Ctrl+L` (or `Cmd+L` on Mac) to open AI chat
   - Ask Cursor:

```
Clone the iTutor repository from:
https://github.com/Bobthebuilder1012/itutor-platform.git

```

Cursor will:
- Choose a good location for you
- Run the git clone command
- Navigate to the folder
- Tell you when it's done

**Or do it manually:**
```bash
git clone https://github.com/Bobthebuilder1012/itutor-platform.git
cd itutor-platform
```

4. **Open the project in Cursor:**
   - File → Open Folder
   - Select the `itutor-platform` folder
   - Click "Open"

---

## 3. Setup Environment with Cursor AI

**This is where Cursor's AI makes your life easy!** Instead of manually typing commands, just ask Cursor to do it for you.

### 3.1 Open Cursor AI Chat

Press `Ctrl+L` (Windows) or `Cmd+L` (Mac) - this opens the AI chat sidebar.

---

### 3.2 Let AI Install Dependencies

**Copy and paste this into Cursor AI:**

```
Install all npm dependencies for this project
```

**Cursor will automatically:**
- Run `npm install`
- Download all packages
- Show you progress
- Tell you when it's done (2-3 minutes)

---

### 3.3 Create Environment File

Tell cursor to create an env.local file.
Open the file and paste the environmental varibles sent by team lead

---

### 3.4 Switch to Dev Branch

**Tell Cursor AI:**
```
Switch to the dev branch and pull the latest changes
```

Cursor will run:
```bash
git checkout dev
git pull origin dev
```

---

### 3.5 Start the Development Server

**Tell Cursor AI:**
```
Start the local development server
```

Cursor will run `npm run dev` for you and tell you when it's ready.

**Or type manually in terminal:**
```bash
npm run dev
```

---

### 3.6 Open in Browser

**That's it!** Open your browser and go to:

**http://localhost:3000**

**You should see the iTutor homepage.** If you do - you're done with setup! 🎉

---

## 4. Start Coding

### Your AI Assistant is Always There

**Instead of memorizing commands, just ask Cursor:**

**You literally just describe what you want, and Cursor does it.**

---

## 5. Daily Workflow

**Every day, just ask Cursor AI to do these things for you:**

### Morning (Starting Work)

**Tell Cursor:**
```
Switch to dev branch, pull latest changes, and start the dev server
```

**Or manually:**
```bash
git checkout dev
git pull origin dev
npm run dev
```

Then open: http://localhost:3000

---

### During the Day (Making Changes)

1. **Get assigned a task** from team lead
2. **Ask Cursor to help you:**
   - "Show me the communities page code"
   - "Add a search bar to this page"
   - "Create a new button component"
   - "Fix this TypeScript error"
3. **Save files** - browser auto-refreshes
4. **Test in browser** - make sure it works

---

### End of Day (Saving Work)

**Tell Cursor:**
```
Commit my changes with message: "Added search feature to communities" 
and push to the dev branch
```

Cursor will:
- Stage your files (`git add .`)
- Create commit with your message
- Push to dev branch (not main!)

**Golden Rule:** ❌ NEVER push to `main` first. Always push to dev or ask cursor to push to local host, test, ensure everything is operating, then once all is well push to main.

---

## 6. Quick Troubleshooting

### "I see errors in the browser"
**Tell Cursor:**
```
Check the browser console and terminal for errors and tell me what's wrong
```

### "The server won't start"
**Tell Cursor:**
```
The dev server won't start. Check what's wrong and fix it
```

Common causes:
- Port 3000 already in use
- Dependencies not installed
- Wrong branch

### "I broke something"
**Tell Cursor:**
```
Undo all my changes and get back to a clean state on dev branch
```

Cursor will run: `git checkout . && git checkout dev && git pull origin dev`

---

## Important File Locations (Quick Reference)

**You don't need to memorize this - just ask Cursor "Where is [thing] located?"**

```
app/
├── communities/           ← Communities pages
├── student/              ← Student pages
├── tutor/                ← Tutor pages
└── api/                  ← Backend endpoints

components/
└── communities/          ← Community UI components

lib/
├── supabase/            ← Database functions
└── types/               ← TypeScript types
```

---

## 9. Troubleshooting

### Problem: "Command not found: npm"

**Solution:** Node.js not installed or not in PATH
```bash
# Reinstall Node.js from https://nodejs.org/
# Restart your terminal after installation
```

---

### Problem: "EACCES" or "Permission denied" errors

**Solution (Mac/Linux):**
```bash
sudo npm install
```

**Solution (Windows):**
- Run terminal as Administrator

---

### Problem: "Cannot connect to database" or "Supabase error"

**Solution:** Check your `.env.local` file
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
3. Make sure there are no extra spaces or quotes
4. Ask team lead to verify credentials

---

### Problem: "Port 3000 already in use"

**Solution:** Another app is using port 3000
```bash
# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Mac/Linux
kill -9 $(lsof -ti:3000)

# Or use a different port
npm run dev -- -p 3001
```

---

### Problem: Git asks for username/password repeatedly

**Solution:** Set up GitHub authentication

**Option A: Use GitHub Desktop** (easiest)
- Clone via GitHub Desktop instead

**Option B: Generate Personal Access Token**
1. GitHub → Settings → Developer Settings → Personal Access Tokens
2. Generate new token (classic)
3. Use token as password when Git asks

**Option C: Use SSH Keys**
```bash
ssh-keygen -t ed25519 -C "your.email@example.com"
# Add key to GitHub: Settings → SSH Keys
```

---

### Problem: "Module not found" errors

**Solution:** Dependencies not installed
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

---

### Problem: Build errors or TypeScript errors

**Solution:** 
1. Make sure you're on the correct branch: `git checkout dev`
2. Pull latest changes: `git pull origin dev`
3. Reinstall dependencies: `npm install`
4. Clear Next.js cache: Delete `.next` folder and restart

---

## 10. Quick Reference Commands

### Starting Your Day
```bash
git checkout dev               # Switch to dev branch
git pull origin dev            # Get latest changes
npm install                    # Update dependencies (if package.json changed)
npm run dev                    # Start server
```

### Viewing Your Changes
```bash
# Open browser: http://localhost:3000
# Press Ctrl+Shift+R to hard refresh (clear cache)
```

### Saving Your Work
```bash
git status                     # See what you changed
git add .                      # Stage all changes
git commit -m "Description"    # Commit changes
git push origin dev            # Push to dev branch
```

### Switching Branches
```bash
git branch                     # See all local branches
git checkout dev               # Switch to dev
git checkout -b feature/my-feature  # Create new branch
```

### Viewing Logs/Errors
- **Browser Console:** Press `F12` → Console tab
- **Server Logs:** Check the terminal where `npm run dev` is running
- **Network Requests:** F12 → Network tab

---

## 11. Important Notes

### What You Can Edit Freely
✅ Components in `components/`
✅ Pages in `app/`
✅ Styles (Tailwind classes)
✅ API routes in `app/api/`
✅ Utility functions in `lib/`

### What to Be Careful With
⚠️ Database migrations (ask before creating)
⚠️ Environment variables (don't commit `.env.local`)
⚠️ Authentication logic (can break login)
⚠️ Payment processing (can affect real money)

### What NOT to Touch
❌ `.git/` folder (Git internal files)
❌ `node_modules/` folder (auto-generated)
❌ `.next/` folder (build cache)
❌ Production database directly (use local/dev only)

---

## 12. Common Development Tasks

### Creating a New Component
```bash
# 1. Create file
touch components/MyNewComponent.tsx

# 2. Basic template
'use client';

export default function MyNewComponent() {
  return (
    <div className="p-4">
      <h1>My Component</h1>
    </div>
  );
}

# 3. Use it in a page
import MyNewComponent from '@/components/MyNewComponent';
```

### Creating a New Page
```bash
# Pages go in app/ directory
# Example: app/test-page/page.tsx
'use client';

export default function TestPage() {
  return <div>Test Page</div>;
}

# Access at: http://localhost:3000/test-page
```

### Viewing Database (Supabase Dashboard)
1. Go to: https://supabase.com/dashboard
2. Sign in (team lead will add you to the project)
3. Select iTutor project
4. **Table Editor:** View data
5. **SQL Editor:** Run queries

---

## 13. Getting Help

### In Order of Preference:

1. **Check this guide first** - Most common issues are covered
2. **Check browser console** (F12) - See actual error messages
3. **Check terminal logs** - Server-side errors appear here
4. **Search existing documentation:**
   - `docs/RUNBOOK.md` - Operations guide
   - `docs/CTO_HANDOVER.md` - Architecture overview
5. **Ask team lead** - Share error messages and what you were trying to do
6. **Google the error** - Most Next.js/React errors have solutions online

### When Asking for Help, Include:
- What you were trying to do
- What command you ran
- Complete error message (screenshot or copy-paste)
- What you've already tried

---

## 14. Your First Task (After Setup)

### Make a Small Test Change

**Goal:** Verify you can make changes and see them work.

1. **Open:** `app/page.tsx` (homepage)
2. **Find:** The main heading text
3. **Change it to:** "Welcome to iTutor - [YOUR NAME] was here!"
4. **Save the file**
5. **Check browser:** Should auto-reload with your change
6. **Revert the change** (don't commit it)

**If you see your change in the browser - SUCCESS! 🎉**

---

## 7. Understanding the Basics

### Branch Rules (Super Important!)

```
main  → Live website (DON'T TOUCH!)
dev   → Where you work (SAFE)
```

**One Rule to Remember:**
- ❌ **NEVER push to `main`** 
- ✅ **ALWAYS work on `dev`**

That's it. Just stay on `dev` and you can't break anything!

---

### How Cursor AI Helps You

**Instead of memorizing Git commands, just talk to Cursor:**

| What You Want | What to Tell Cursor |
|---------------|---------------------|
| Save my work | "Commit my changes and push to dev" |
| Get latest code | "Pull latest changes from dev" |
| Create new file | "Create a new component called SearchBar" |
| Fix an error | "Fix this TypeScript error" |
| Find something | "Where is the communities page?" |
| Undo changes | "Revert my changes to this file" |

**You literally just ask in plain English.** No commands to memorize!

---

## 8. Pro Tips for Using Cursor AI

### Make Cursor Your Coding Partner

**Good Prompts:**
- ✅ "Add a search bar to the communities page with a green button"
- ✅ "Create a new API endpoint for fetching user posts"
- ✅ "Fix the styling on mobile view for this component"
- ✅ "Explain what this function does"
- ✅ "Commit my changes with message: Add search feature"

**Vague Prompts (Less Helpful):**
- ❌ "Make it better"
- ❌ "Fix everything"
- ❌ "Help"

**Be specific, and Cursor will do amazing work!**

---

### Cursor Can See Your Whole Project

Cursor understands:
- Your file structure
- Your code style
- Your dependencies
- Your git status

**So you can ask contextual questions:**
- "Why is this component not showing up?"
- "How do I add a new page?"
- "What's causing this error?"

---

## 9. First Real Task

**After setup, ask your team lead:**
> "I'm all set up! What should I work on first?"

**They'll probably give you something like:**
- Add a button to a page
- Change some text or styling
- Create a new component
- Fix a small bug

**Then just ask Cursor to help you do it!**

---

## 10. Getting Help

### Ask in This Order:

1. **Cursor AI** - It knows the codebase and can help with most issues
2. **Team Lead** - For bigger questions or when stuck
3. **This Guide** - For setup/workflow questions

**When asking team lead, share:**
- Screenshot of the error
- What you were trying to do
- What Cursor suggested (if anything)

---

## ✅ Setup Complete Checklist

Confirm you have all of these working:

- [ ] Cursor installed and opened
- [ ] Project cloned and opened in Cursor
- [ ] `.env.local` file created with credentials
- [ ] On `dev` branch (run: `git branch` - should show `* dev`)
- [ ] Dependencies installed (`node_modules/` folder exists)
- [ ] Dev server running (`npm run dev` worked)
- [ ] Browser shows iTutor at http://localhost:3000
- [ ] Made a test edit and saw it update in browser
- [ ] Understand: Work on `dev`, never push to `main`

**All checked? You're ready to code! 🎉**

---

## What the Team Lead Needs to Give You

**Before you can start, team lead must provide:**
- [ ] GitHub repository invite (check email)
- [ ] `.env.local` credentials (via secure message)

**Optional (helpful but not required):**
- [ ] Supabase dashboard access
- [ ] Vercel dashboard access
- [ ] Communication channel (Discord/Slack/WhatsApp)

---

## Summary: The Whole Process

```
1. Install: Cursor + Node.js + Git (15 min)
2. Get access: GitHub invite + .env.local (5 min)
3. Clone: git clone <repo> (2 min)
4. Setup: Let Cursor AI install dependencies (3 min)
5. Configure: Create .env.local (2 min)
6. Run: npm run dev (1 min)
7. Code: Ask Cursor to help you build features! ✨
```

**Total: ~30 minutes to start coding with AI assistance**

---

**Welcome to the team! Cursor AI has your back. 🚀**

**Questions?** Ask your team lead or just ask Cursor directly!
