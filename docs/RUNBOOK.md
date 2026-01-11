# iTutor Platform — Operational Runbook

**Quick reference guide for common operational tasks, deployments, and incident response.**

---

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [Deployment Procedures](#deployment-procedures)
3. [Database Operations](#database-operations)
4. [Incident Response](#incident-response)
5. [Maintenance Tasks](#maintenance-tasks)
6. [Emergency Contacts](#emergency-contacts)

---

## Local Development Setup

### Initial Setup (First Time)

```bash
# 1. Clone repository
git clone <repository-url>
cd Pilot

# 2. Install dependencies
npm install

# 3. Copy environment template
cp env.example .env.local

# 4. Edit .env.local with your Supabase credentials
# Get credentials from: https://app.supabase.com → Your Project → Settings → API
```

**.env.local** (required values):
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

```bash
# 5. Run development server
npm run dev

# 6. Open browser
# → http://localhost:3000
```

### Daily Development Workflow

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Start dev server
npm run dev

# Make changes, test locally

# Commit and push
git add .
git commit -m "Descriptive message"
git push origin main
# ↑ Triggers automatic Vercel production deploy
```

---

## Deployment Procedures

### Production Deployment (Automatic)

**Trigger**: Push to `main` branch

```bash
git push origin main
```

**What happens**:
1. GitHub webhook notifies Vercel
2. Vercel builds Next.js app (`npm run build`)
3. Deploy to production (~2 minutes)
4. Deployment URL: `https://itutor-platform.vercel.app`

**Monitoring**:
- Vercel Dashboard → Deployments → View logs
- Check for build errors or runtime failures

---

### Manual Rollback

**If deployment breaks production**:

**Option 1: Via Vercel Dashboard**
1. Go to Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "..." → Promote to Production

**Option 2: Via Git Revert**
```bash
# Revert last commit
git revert HEAD
git push origin main
# Vercel automatically deploys reverted version
```

---

### Hotfix Deployment

**For critical bugs in production**:

```bash
# 1. Create hotfix branch (optional for solo dev)
git checkout -b hotfix/critical-bug

# 2. Make fix, test locally
npm run dev

# 3. Commit and push to main
git checkout main
git merge hotfix/critical-bug
git push origin main

# 4. Verify deployment in Vercel dashboard
```

---

## Database Operations

### Applying a Migration

**Current Process** (Manual):

1. **Write SQL** in `src/supabase/migrations/XXX_description.sql`

2. **Copy SQL content**

3. **Open Supabase Dashboard**:
   - [https://app.supabase.com](https://app.supabase.com)
   - Navigate to your project
   - Click "SQL Editor"

4. **Paste SQL and Run**:
   - Paste migration SQL
   - Click **Run** button
   - Check for errors in output

5. **Verify** migration applied:
   ```sql
   -- Check table exists
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'new_table_name';
   
   -- Check column added
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'existing_table';
   ```

⚠️ **Important**:
- Always test migrations locally first (use a dev Supabase project)
- Use transactions for multi-statement migrations:
  ```sql
  BEGIN;
  -- Your migration statements
  COMMIT;
  -- Or ROLLBACK; if something fails
  ```

---

### Creating a New Migration

**Naming Convention**: `NNN_descriptive_name.sql`

**Template**:
```sql
-- =====================================================
-- Migration: Brief description
-- Date: YYYY-MM-DD
-- =====================================================

-- Check if change already applied (idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_name' AND column_name = 'new_column'
  ) THEN
    ALTER TABLE table_name ADD COLUMN new_column TEXT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column);

-- Update RLS policies if needed
DROP POLICY IF EXISTS "Old policy" ON table_name;
CREATE POLICY "New policy" ON table_name
FOR SELECT USING (user_id = auth.uid());
```

---

### Database Backup & Restore

**Automatic Backups** (Supabase):
- Daily backups enabled on Supabase Pro plan
- Access via Supabase Dashboard → Database → Backups

**Manual Backup**:
```bash
# Export via Supabase Dashboard
# Database → Backups → Download

# Or via pg_dump (if you have direct access)
pg_dump -h db.PROJECT_REF.supabase.co -U postgres -d postgres > backup.sql
```

**Restore**:
```bash
psql -h db.PROJECT_REF.supabase.co -U postgres -d postgres < backup.sql
```

⚠️ **Test restores in staging environment first!**

---

## Incident Response

### Issue Triage Checklist

**When production issue reported**:

- [ ] **Confirm severity**:
  - Critical: System down, payments failing, data loss
  - High: Major feature broken, affecting many users
  - Medium: Minor feature broken, workaround available
  - Low: Cosmetic issue, no functional impact

- [ ] **Check Vercel status**:
  - Vercel Dashboard → Functions → View recent logs
  - Look for 5xx errors, timeouts

- [ ] **Check Supabase status**:
  - Supabase Dashboard → Logs
  - Look for database errors, RLS policy violations

- [ ] **Check recent deployments**:
  - Did issue start after recent deploy?
  - If yes, consider rollback

---

### Common Issues & Solutions

#### 1. Users Can't Log In

**Symptoms**: "Unauthorized" errors, login loop

**Checklist**:
- [ ] Check Supabase Auth logs for errors
- [ ] Verify env vars in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Test with fresh signup (isolate user-specific vs system-wide)
- [ ] Check if Supabase project is paused (free tier inactivity)

**Fix**:
```bash
# If env vars missing/wrong in Vercel:
# 1. Vercel Dashboard → Settings → Environment Variables
# 2. Update values
# 3. Redeploy: vercel --prod
```

---

#### 2. Payment Stuck in "Pending"

**Symptoms**: Booking shows "pending payment" but user paid

**Checklist**:
- [ ] Check WiPay webhook logs in Vercel:
  - `/api/payments/wipay/webhook`
- [ ] Verify webhook URL matches production URL
- [ ] Check signature verification (may be failing)
- [ ] Check WiPay dashboard for payment status

**Manual Fix** (if webhook lost):
```sql
-- 1. Find payment by provider reference (from WiPay dashboard)
SELECT * FROM payments WHERE provider_reference = 'TX123456';

-- 2. Manually complete payment (use with caution!)
SELECT complete_booking_payment(
  p_booking_id := 'booking-uuid-here',
  p_payment_id := 'payment-uuid-here',
  p_provider_reference := 'TX123456'
);

-- 3. Verify booking updated
SELECT * FROM bookings WHERE id = 'booking-uuid-here';
```

⚠️ **Only use manual fix after confirming payment succeeded in WiPay dashboard!**

---

#### 3. Vercel Deploy Failed

**Symptoms**: Build errors in Vercel dashboard

**Checklist**:
- [ ] View build logs in Vercel Dashboard
- [ ] Common causes:
  - TypeScript errors
  - Missing dependencies
  - Missing environment variables

**Fix**:
```bash
# Test build locally
npm run build

# If successful locally, check Vercel env vars
# If fails locally, fix TypeScript errors

# TypeScript check only
npm run type-check

# Linting
npm run lint
```

---

#### 4. Database Migration Failed

**Symptoms**: SQL errors, broken queries

**Checklist**:
- [ ] Check Supabase logs for exact error
- [ ] Identify problematic migration
- [ ] Check if migration was partially applied

**Rollback**:
```sql
-- Example: Undo added column
ALTER TABLE bookings DROP COLUMN IF EXISTS new_column;

-- Example: Undo table creation
DROP TABLE IF EXISTS new_table;

-- Example: Restore old RLS policy
DROP POLICY IF EXISTS "New policy" ON table_name;
CREATE POLICY "Old policy" ON table_name
FOR SELECT USING (old_condition);
```

**Fix & Reapply**:
1. Fix migration SQL locally
2. Test in dev Supabase project
3. Reapply in production

---

#### 5. RLS Policy Violation

**Symptoms**: "new row violates row-level security policy" errors

**Checklist**:
- [ ] Check which table is affected
- [ ] Review RLS policies on that table
- [ ] Check if API route is using service role key (should bypass RLS)

**Debug**:
```sql
-- View policies on a table
SELECT * FROM pg_policies WHERE tablename = 'bookings';

-- Test policy as specific user
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-uuid-here';
SELECT * FROM bookings; -- Should respect RLS
```

**Fix**:
```sql
-- Add missing policy
CREATE POLICY "Allow operation" ON table_name
FOR INSERT
WITH CHECK (user_id = auth.uid());
```

---

#### 6. Cron Job Not Running

**Symptoms**: Scheduled charges not processing

**Checklist**:
- [ ] Check Vercel Dashboard → Cron Jobs
- [ ] View execution logs
- [ ] Verify `CRON_SECRET` env var set

**Test Manually**:
```bash
curl -X GET https://itutor-platform.vercel.app/api/cron/process-charges \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Fix**:
- If not configured: Add cron job in `vercel.json`
- If failing: Check function logs for errors
- If unauthorized: Set `CRON_SECRET` in Vercel env vars

---

## Maintenance Tasks

### Weekly Tasks

- [ ] **Review Vercel function logs** for errors
- [ ] **Check Supabase database size** (avoid hitting limits)
- [ ] **Review pending verification requests** (admin dashboard)
- [ ] **Monitor payment webhook failures** (check logs)

### Monthly Tasks

- [ ] **Review and archive old notifications** (keep database lean)
- [ ] **Check for unused storage files** (avatars, verifications)
- [ ] **Audit admin/reviewer access** (remove inactive accounts)
- [ ] **Review database indexes** (add based on slow query log)

### Quarterly Tasks

- [ ] **Update dependencies** (`npm outdated`, review security advisories)
- [ ] **Review Vercel/Supabase costs** (optimize if needed)
- [ ] **Backup database manually** (in addition to automatic backups)
- [ ] **Review and update documentation** (this runbook, schema docs)

---

### Updating Dependencies

```bash
# Check outdated packages
npm outdated

# Update all to latest (be careful!)
npm update

# Or update specific package
npm install package-name@latest

# Test thoroughly after updates
npm run build
npm run dev

# Commit and deploy
git add package.json package-lock.json
git commit -m "chore: Update dependencies"
git push origin main
```

⚠️ **Always test dependency updates locally before deploying to production!**

---

### Rotating Secrets

**If a secret is compromised**:

1. **Supabase Keys**:
   - Go to Supabase Dashboard → Settings → API
   - Click "Reset API Key" (for anon key) or "Reset Service Role Key"
   - Update Vercel env vars immediately
   - Redeploy application

2. **WiPay API Key**:
   - Contact WiPay support to regenerate
   - Update `WIPAY_API_KEY` in Vercel env vars
   - Redeploy

3. **CRON_SECRET**:
   - Generate new secret: `openssl rand -hex 32`
   - Update `CRON_SECRET` in Vercel env vars
   - Redeploy (Vercel cron runner automatically uses new secret)

---

## Environment Variables Reference

### Development (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Production (Vercel Dashboard)

**Required**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... (SECRET!)
NEXT_PUBLIC_APP_URL=https://itutor-platform.vercel.app
CRON_SECRET=random-secret-here (SECRET!)
```

**Optional** (if WiPay configured):
```env
WIPAY_ACCOUNT_NUMBER=your-account
WIPAY_API_KEY=your-api-key (SECRET!)
```

**How to Set** (Vercel):
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Add key-value pairs
3. Select environment scope (Production / Preview / Development)
4. Redeploy to apply changes

---

## Emergency Contacts

### Platform Access

| Service | URL | Role |
|---------|-----|------|
| **Vercel** | [https://vercel.com/dashboard](https://vercel.com/dashboard) | Hosting & deployment |
| **Supabase** | [https://app.supabase.com](https://app.supabase.com) | Database & backend |
| **GitHub** | (Private repository URL) | Source code |
| **WiPay** | [https://wipayfinancial.com](https://wipayfinancial.com) | Payment gateway |

### Documentation

| Document | Purpose |
|----------|---------|
| [`docs/CTO_HANDOVER.md`](./CTO_HANDOVER.md) | Comprehensive platform overview |
| [`src/supabase/SCHEMA_SUMMARY.md`](../src/supabase/SCHEMA_SUMMARY.md) | Database schema reference |
| [`src/supabase/FLOW_SUMMARY.md`](../src/supabase/FLOW_SUMMARY.md) | End-to-end data flows |
| [`src/supabase/RLS_IMPLEMENTATION_GUIDE.md`](../src/supabase/RLS_IMPLEMENTATION_GUIDE.md) | RLS policy reference |

---

## Quick Command Reference

```bash
# Development
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:3000)
npm run build        # Test production build
npm run lint         # Run linter
npm run type-check   # TypeScript type checking (if configured)

# Git Operations
git status           # Check changed files
git add .            # Stage all changes
git commit -m "..."  # Commit with message
git push origin main # Push to main (triggers deploy)
git pull origin main # Pull latest changes

# Deployment
git push origin main           # Auto-deploy to production
vercel                         # Manual deploy to preview (Vercel CLI)
vercel --prod                  # Manual deploy to production
vercel logs                    # View production logs

# Database (via Supabase Dashboard)
# → SQL Editor: Run migrations
# → Database → Backups: Download backups
# → Logs: View query logs
```

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-10 | Initial runbook created | Dev Team |

---

**Document Maintained By**: Platform Team  
**Last Reviewed**: January 2026  
**Next Review**: April 2026 (Quarterly)


