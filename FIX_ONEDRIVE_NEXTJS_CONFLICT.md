# Fix OneDrive + Next.js File Locking Issue

## Problem
OneDrive syncs the `.next` build folder, causing file locks that prevent Next.js from rebuilding.

Error: `EBUSY: resource busy or locked`

---

## Solution 1: Exclude `.next` from OneDrive (Recommended)

### Method A: Using OneDrive Settings
1. Right-click the **OneDrive icon** in system tray
2. Click **Settings** → **Sync and backup** → **Advanced settings**
3. Click **Files On-Demand**
4. Navigate to your project folder in File Explorer
5. Right-click `.next` folder → **Free up space** (makes it online-only)

### Method B: Using File Explorer
1. Open File Explorer
2. Go to: `C:\Users\liamd\OneDrive\Documents\Pilot\`
3. Right-click `.next` folder
4. Select **"Always keep on this device"** (uncheck it)
5. This prevents OneDrive from actively syncing this folder

### Method C: Add to .gitignore (Already done, but OneDrive ignores git)
OneDrive doesn't respect `.gitignore`, so this alone won't work.

---

## Solution 2: Move Project Out of OneDrive (Best Practice)

Move your project to a local folder that OneDrive doesn't sync:

```powershell
# Stop dev server first!
cd C:\Users\liamd\
mkdir Projects
xcopy /E /I "OneDrive\Documents\Pilot" "Projects\Pilot"
cd Projects\Pilot
npm install
npm run dev
```

**Recommended locations:**
- `C:\Users\liamd\Projects\Pilot`
- `C:\Dev\Pilot`
- `D:\Projects\Pilot` (if you have another drive)

---

## Quick Fix (Temporary)

If you just want to get back to work quickly:

```powershell
# Stop dev server
# Delete .next folder
Remove-Item -Recurse -Force .next

# Clear node_modules cache (optional)
Remove-Item -Recurse -Force node_modules\.cache

# Restart
npm run dev
```

This will work until OneDrive locks the files again.

---

## Why This Happens

1. Next.js constantly rebuilds files in `.next/` during development
2. OneDrive tries to sync these files to the cloud
3. OneDrive locks files while syncing
4. Next.js can't rebuild → EBUSY error
5. Dev server crashes

---

## Best Practice Going Forward

**Never put development projects in synced folders:**
- ❌ OneDrive
- ❌ Dropbox
- ❌ Google Drive
- ❌ iCloud

**Use Git for version control instead:**
- ✅ Git + GitHub/GitLab
- ✅ Local folder + Git backup
- ✅ WSL2 (if on Windows)

---

## Additional Tips

### Exclude Other Build Folders Too:
- `.next/`
- `node_modules/`
- `.cache/`
- `dist/`
- `build/`

### Use Git for Backups:
```bash
git remote add origin https://github.com/yourusername/pilot.git
git push -u origin main
```

This is safer and more reliable than OneDrive for code.
