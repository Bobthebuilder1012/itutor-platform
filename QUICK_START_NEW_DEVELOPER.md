# 🚀 iTutor Platform - Quick Start (5 Minutes)

**Super quick reference for new developers who just want to get started NOW.**

---

## ⚡ Fast Track Setup

### 1. Install Required Software (15 minutes)

| Software | Download Link | Purpose |
|----------|--------------|---------|
| **Git** | https://git-scm.com/downloads | Version control |
| **Node.js** | https://nodejs.org/ (get LTS) | JavaScript runtime |
| **Cursor** | https://cursor.sh/ | Code editor (team uses this) |

**Test installations:**
```bash
git --version    # Should work
node --version   # Should work
npm --version    # Should work
```

---

### 2. Get Repository Access (5 minutes)

**Ask team lead for:**
- [ ] GitHub repository invite
- [ ] `.env.local` file content (via secure method)

---

### 3. Clone & Run (5 minutes)

```bash
# Clone repository
git clone https://github.com/Bobthebuilder1012/itutor-platform.git
cd itutor-platform

# Switch to dev branch
git checkout dev

# Install dependencies
npm install

# Create .env.local file
# (Paste the content team lead sent you)

# Start server
npm run dev
```

**Open browser:** http://localhost:3000

**If you see the iTutor homepage - YOU'RE DONE! ✅**

---

## 📋 Your Daily Workflow

### Morning:
```bash
git checkout dev
git pull origin dev
npm run dev
```

### During Work:
- Make changes in code editor
- Save files → browser auto-reloads
- Test in browser

### End of Day:
```bash
git status
git add .
git commit -m "What you did today"
git push origin dev
```

---

## ⚠️ Golden Rules

| ✅ DO | ❌ DON'T |
|-------|----------|
| Work on `dev` branch | Push to `main` branch |
| Commit often | Commit `.env.local` file |
| Test before pushing | Push broken code |
| Ask questions | Guess if unsure |
| Pull before you start | Work on outdated code |

---

## 🆘 Emergency Commands

### "My code is broken, start fresh"
```bash
git checkout dev
git reset --hard origin/dev
npm install
npm run dev
```

### "Port 3000 already in use"
```bash
# Windows
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Mac/Linux
kill -9 $(lsof -ti:3000)
```

### "I accidentally changed the wrong files"
```bash
git checkout .    # Undo all changes
git status        # Verify clean
```

---

## 📱 Key URLs

| Purpose | URL |
|---------|-----|
| **Your Localhost** | http://localhost:3000 |
| **Live Site** | https://itutor-platform.vercel.app |
| **GitHub Repo** | https://github.com/Bobthebuilder1012/itutor-platform |
| **Supabase** | https://supabase.com/dashboard |

---

## 🎯 First Task Checklist

- [ ] Setup complete (localhost running)
- [ ] Can navigate the site
- [ ] Browser console shows no critical errors (F12)
- [ ] Confirmed on `dev` branch (`git branch` shows `* dev`)
- [ ] Made a test change and saw it update
- [ ] Ready for first real task!

---

## 📚 Full Documentation

For detailed guides:
- **Complete Setup:** `NEW_DEVELOPER_SETUP_GUIDE.md`
- **Collaboration:** `COLLABORATING_ON_COMMUNITIES.md`
- **Operations:** `docs/RUNBOOK.md`
- **Architecture:** `docs/CTO_HANDOVER.md`

---

**Got localhost running? You're 90% there. Welcome to the team! 🎉**
