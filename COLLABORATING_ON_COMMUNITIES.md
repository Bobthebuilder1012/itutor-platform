# How to Collaborate on Communities Without Pushing to Main

**Quick guide for working on the Communities feature as a team without affecting the live site.**

---

## The Problem You're Solving

Your friend did work on Communities, but:
- ❌ Can't push to `main` (would go live immediately)
- ❌ You can't see their work on your localhost
- ✅ Need to share and review code safely

---

## The Solution: Feature Branch Workflow

```
Your Friend's Computer          GitHub (Cloud)          Your Computer
       │                             │                         │
       │  1. Create branch           │                         │
       │  feature/communities        │                         │
       ├─────────────────────────────>                         │
       │                             │                         │
       │  2. Push changes            │                         │
       ├─────────────────────────────>                         │
       │                             │  3. Pull branch         │
       │                             <─────────────────────────┤
       │                             │                         │
       │                             │  4. See changes!        │
       │                             │                         ✓
```

---

## Step-by-Step: For Your Friend

### What Your Friend Should Do:

**1. Check Current Branch**
```bash
git branch
# If not on dev, switch to it
git checkout dev
```

**2. Pull Latest Changes**
```bash
git pull origin dev
```

**3. Create a Feature Branch**
```bash
git checkout -b feature/communities-updates
```

**4. Make Changes to Communities**
```bash
# Edit files in:
# - app/communities/
# - components/communities/
# - lib/supabase/community.ts
# etc.
```

**5. Commit Changes**
```bash
git status                                  # See what changed
git add .                                   # Stage all changes
git commit -m "Update communities UI and add search feature"
```

**6. Push to GitHub (NOT to main!)**
```bash
git push origin feature/communities-updates
```

**7. Notify You**
Send you a message:
> "Hey! I pushed my communities work to the `feature/communities-updates` branch. Pull it to see the changes!"

---

## Step-by-Step: For You (Viewing Their Work)

### What You Should Do:

**1. Fetch Latest Branches**
```bash
git fetch origin
```

**2. See All Available Branches**
```bash
git branch -r
# You should see: origin/feature/communities-updates
```

**3. Switch to Their Branch**
```bash
git checkout feature/communities-updates
```

**4. Your Dev Server Auto-Reloads!**
- If server is running, it will hot-reload with changes
- If not running: `npm run dev`
- Open: http://localhost:3000/communities

**5. Test Their Changes**
- Navigate around the communities feature
- Check for bugs
- Provide feedback

---

## Providing Feedback

### If Changes Look Good:
```bash
# Merge their work into dev
git checkout dev
git merge feature/communities-updates
git push origin dev
```

### If Changes Need Work:
Send them feedback:
> "Looks great! Can you fix [specific issue] and push again? I'm on your branch and can test immediately when you update."

They can push more commits to the same branch:
```bash
# On their computer
git add .
git commit -m "Fix: address feedback"
git push origin feature/communities-updates

# On your computer
git pull origin feature/communities-updates  # Get their updates
```

---

## Multiple People Working Simultaneously

### Scenario: You AND Your Friend Both Working

**Your Friend:**
```bash
git checkout -b feature/communities-ui
# Work on UI improvements
git push origin feature/communities-ui
```

**You:**
```bash
git checkout -b feature/communities-api
# Work on API endpoints
git push origin feature/communities-api
```

**Both branches exist simultaneously without conflicts!**

---

## Visual Branch Workflow

```
main (production - DO NOT TOUCH)
  │
  ├─── dev (shared development)
  │     │
  │     ├─── feature/communities-ui (friend's work)
  │     │
  │     ├─── feature/communities-api (your work)
  │     │
  │     └─── feature/communities-backend (another teammate)
  │
  └─── All features merge to dev for testing
        │
        └─── When ready: dev → main (goes live)
```

---

## Quick Commands Reference

### Your Friend (Sharing Work):
```bash
# Create branch
git checkout -b feature/my-work

# Save work
git add .
git commit -m "Description"
git push origin feature/my-work

# Update with more changes
git add .
git commit -m "More updates"
git push origin feature/my-work
```

### You (Reviewing Work):
```bash
# Get their branch
git fetch origin
git checkout feature/my-work

# Test in browser
npm run dev
# → http://localhost:3000

# Switch back to your work
git checkout dev
```

---

## Important: Keeping Branches Updated

### If dev Gets Updated While You're Working:

**Your friend should regularly sync with dev:**
```bash
# While on their feature branch
git checkout dev
git pull origin dev
git checkout feature/communities-updates
git merge dev
# Resolve any conflicts
git push origin feature/communities-updates
```

**This prevents merge conflicts later!**

---

## When to Merge to Main (Production)

### Checklist Before Going Live:

- [ ] All features tested on `dev` branch
- [ ] No console errors
- [ ] Database migrations tested
- [ ] Team reviewed the changes
- [ ] Product owner approves
- [ ] No secrets committed (double-check)

### Merge Process:
```bash
# 1. Make sure dev is fully tested
git checkout dev
git pull origin dev

# 2. Merge dev → main
git checkout main
git pull origin main
git merge dev

# 3. Push to production
git push origin main
# ↑ This triggers Vercel deployment (goes live in ~2 minutes)
```

---

## Emergency: Undo a Branch

### If Your Friend Pushed Bad Code:

**Option 1: Create a Fix**
```bash
# Easier: just fix the issue in a new commit
git checkout feature/communities-updates
# Fix the code
git add .
git commit -m "Fix: resolve issue"
git push origin feature/communities-updates
```

**Option 2: Force Reset (Use Carefully)**
```bash
# On their computer
git reset --hard HEAD~1  # Undo last commit
git push origin feature/communities-updates --force
```

⚠️ **Warning:** Force push erases history. Only do this on feature branches!

---

## Pro Tips

### Tip 1: Use Descriptive Branch Names
```bash
✅ git checkout -b feature/communities-search-filter
✅ git checkout -b fix/communities-mobile-styling
✅ git checkout -b update/communities-database-query

❌ git checkout -b test
❌ git checkout -b new-branch
❌ git checkout -b asdf
```

### Tip 2: Commit Often
```bash
# Bad: One huge commit at the end of the day
git commit -m "Did a bunch of stuff"

# Good: Small, focused commits
git commit -m "Add search input to communities page"
git commit -m "Connect search input to filter function"
git commit -m "Add loading state while searching"
```

### Tip 3: Pull Before You Push
```bash
# Always check for updates first
git pull origin dev

# Then push your work
git push origin dev
```

---

## Communication Template

### When Sharing a Branch:

**Your Friend → You:**
> 🚀 **Branch Ready for Review**
> 
> **Branch:** `feature/communities-search`  
> **Changes:** Added search functionality to communities page  
> **How to test:**  
> 1. `git checkout feature/communities-search`  
> 2. Open `/communities`  
> 3. Try searching for "Math" or "Science"  
> 
> Let me know what you think!

### When Providing Feedback:

**You → Your Friend:**
> 👀 **Review Complete**
> 
> **Overall:** Looks great! Working smoothly.  
> **Issues found:**  
> - Search button alignment is off on mobile  
> - Need to handle empty search results  
> 
> **Next steps:** Can you fix these and push again?

---

## Summary

**For Collaboration Without Affecting Main:**

1. ✅ Friend creates feature branch
2. ✅ Friend pushes to feature branch (NOT main)
3. ✅ You pull feature branch
4. ✅ You test on localhost
5. ✅ Provide feedback
6. ✅ When ready → merge to `dev`
7. ✅ After full testing → merge `dev` to `main`

**Key Rule:** `main` = production, `dev` = testing, `feature/*` = work in progress

---

**Need help? Check:**
- `NEW_DEVELOPER_SETUP_GUIDE.md` - Initial setup
- `docs/RUNBOOK.md` - Operations guide
- This guide - Collaboration workflow
