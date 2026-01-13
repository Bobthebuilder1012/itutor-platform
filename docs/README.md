# iTutor Platform Documentation

**Welcome to the iTutor platform documentation.** This directory contains comprehensive technical documentation for the new CTO and development team.

---

## 📚 Documentation Index

### For New CTO (Start Here)

1. **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** ⭐ **START HERE**
   - Comprehensive platform overview
   - Architecture diagrams and data flows
   - Technology stack and services
   - Development workflow (how Cursor, GitHub, Supabase, Vercel were used)
   - Security and access control
   - Monitoring and incident response
   - Future roadmap and scaling considerations
   - **Read this first** to understand the entire platform

2. **[RUNBOOK.md](./RUNBOOK.md)** ⭐ **OPERATIONS GUIDE**
   - Local development setup checklist
   - Deployment procedures (production, rollback, hotfix)
   - Database operations (migrations, backups)
   - Incident response playbooks
   - Common issues and solutions
   - Maintenance tasks (weekly, monthly, quarterly)
   - **Use this daily** for operational tasks

---

### Database & Schema

Located in [`../src/supabase/`](../src/supabase/):

3. **[SCHEMA_SUMMARY.md](../src/supabase/SCHEMA_SUMMARY.md)**
   - Complete database schema (63 tables)
   - Entity relationships
   - Key constraints and indexes
   - Performance considerations

4. **[FLOW_SUMMARY.md](../src/supabase/FLOW_SUMMARY.md)**
   - End-to-end data flows
   - User onboarding (student, parent, tutor)
   - Session booking → payment → completion
   - Verification workflow
   - Payout process

5. **[RLS_IMPLEMENTATION_GUIDE.md](../src/supabase/RLS_IMPLEMENTATION_GUIDE.md)**
   - Row Level Security policy specifications
   - How to test RLS policies
   - Security model and best practices

---

### Feature-Specific Documentation

6. **[PAYMENTS_SYSTEM_README.md](../PAYMENTS_SYSTEM_README.md)**
   - WiPay integration details
   - Tiered platform fee structure (10%/15%/20%)
   - Payment webhook handling
   - Escrow-style flow

7. **[institutions-implementation-summary.md](./institutions-implementation-summary.md)**
   - School/institution management system
   - Geographic hierarchy (Trinidad & Tobago)

8. **[user-subjects-implementation-summary.md](./user-subjects-implementation-summary.md)**
   - CSEC/CAPE subject catalog
   - Tutor subject offerings

9. **[backend-api.md](./backend-api.md)**
   - API endpoint reference
   - Request/response examples

---

### Process & Consistency

10. **[DOCUMENTATION_CONSISTENCY_NOTES.md](./DOCUMENTATION_CONSISTENCY_NOTES.md)**
    - Cross-reference checks performed
    - Corrections made (e.g., platform fee structure)
    - Documentation hierarchy and recommendations
    - Which docs are authoritative vs. historical

---

## 🚀 Quick Start Guide

**If you're the new CTO and need to get up to speed fast:**

### Day 1: Understand the Platform
- [ ] Read **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** (comprehensive overview)
- [ ] Skim **[SCHEMA_SUMMARY.md](../src/supabase/SCHEMA_SUMMARY.md)** (data model)
- [ ] Review **[FLOW_SUMMARY.md](../src/supabase/FLOW_SUMMARY.md)** (key user flows)

### Day 2: Set Up Local Environment
- [ ] Follow **[RUNBOOK.md](./RUNBOOK.md)** → Local Development Setup
- [ ] Clone repo, install dependencies
- [ ] Get Supabase credentials, create `.env.local`
- [ ] Run `npm run dev` and verify app loads

### Day 3: Explore the Codebase
- [ ] Review key API routes in `app/api/`:
  - `payments/wipay/webhook/route.ts` (payment processing)
  - `cron/process-charges/route.ts` (scheduled jobs)
  - `tutor/verification/upload/route.ts` (file uploads)
  - `admin/verification/requests/[id]/approve/route.ts` (admin workflows)
- [ ] Check Vercel Dashboard (deployments, cron logs)
- [ ] Check Supabase Dashboard (database, auth, storage)

### Week 1: Deploy a Small Change
- [ ] Make a minor UI change (e.g., text update)
- [ ] Test locally: `npm run build && npm run dev`
- [ ] Commit and push to `main`: `git push origin main`
- [ ] Monitor Vercel auto-deploy
- [ ] Verify change in production

### Week 2: Plan Improvements
- [ ] Review "Future Roadmap & Scaling" in **[CTO_HANDOVER.md](./CTO_HANDOVER.md)**
- [ ] Identify technical debt priorities (CI/CD, testing, migration automation)
- [ ] Plan team onboarding if expanding beyond solo development

---

## 📖 Documentation Hierarchy

### Primary (Authoritative - Always Up-to-Date)

✅ **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** - Architecture & operations  
✅ **[RUNBOOK.md](./RUNBOOK.md)** - Day-to-day procedures  
✅ **[SCHEMA_SUMMARY.md](../src/supabase/SCHEMA_SUMMARY.md)** - Database schema  
✅ **[FLOW_SUMMARY.md](../src/supabase/FLOW_SUMMARY.md)** - Data flows  
✅ **[RLS_IMPLEMENTATION_GUIDE.md](../src/supabase/RLS_IMPLEMENTATION_GUIDE.md)** - RLS policies  
✅ **[PAYMENTS_SYSTEM_README.md](../PAYMENTS_SYSTEM_README.md)** - Payment implementation

### Secondary (Historical/Feature-Specific)

⚠️ **[README-BACKEND.md](../README-BACKEND.md)** - Historical (contains outdated fee structure)  
⚠️ **[FRONTEND_README.md](../FRONTEND_README.md)** - Basic frontend guide  
⚠️ **[SETUP.md](../SETUP.md)** - Initial setup instructions

**Note**: When in doubt, refer to **Primary** docs or the actual codebase (migrations, API routes).

---

## 🔍 Finding Information

### Architecture & Design Decisions
→ **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** (Section: Architecture Overview)

### How to Deploy
→ **[RUNBOOK.md](./RUNBOOK.md)** (Section: Deployment Procedures)

### Database Tables & Relationships
→ **[SCHEMA_SUMMARY.md](../src/supabase/SCHEMA_SUMMARY.md)**

### Payment Flow Details
→ **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** (Section: Session Booking & Payment Flow)  
→ **[PAYMENTS_SYSTEM_README.md](../PAYMENTS_SYSTEM_README.md)**

### How Cursor was Used
→ **[CTO_HANDOVER.md](./CTO_HANDOVER.md)** (Section: Tooling Guide → 1. Cursor IDE)

### How to Apply Database Migrations
→ **[RUNBOOK.md](./RUNBOOK.md)** (Section: Database Operations → Applying a Migration)

### Incident Response Procedures
→ **[RUNBOOK.md](./RUNBOOK.md)** (Section: Incident Response)

### RLS Policy Examples
→ **[RLS_IMPLEMENTATION_GUIDE.md](../src/supabase/RLS_IMPLEMENTATION_GUIDE.md)**

---

## 🛠️ Maintenance

**This documentation should be reviewed and updated**:
- **Quarterly**: Check for outdated information, new features
- **After major releases**: Update architecture diagrams, add new flows
- **When processes change**: Update RUNBOOK.md procedures

**Document Owner**: CTO / Technical Lead  
**Last Updated**: January 2026

---

## 📞 Need Help?

- **Platform Access**: See [CTO_HANDOVER.md](./CTO_HANDOVER.md) → Appendix D: Key Contacts & Resources
- **Supabase Questions**: Check [SCHEMA_SUMMARY.md](../src/supabase/SCHEMA_SUMMARY.md) or [RLS_IMPLEMENTATION_GUIDE.md](../src/supabase/RLS_IMPLEMENTATION_GUIDE.md)
- **Deployment Issues**: See [RUNBOOK.md](./RUNBOOK.md) → Incident Response
- **Payment/WiPay**: See [PAYMENTS_SYSTEM_README.md](../PAYMENTS_SYSTEM_README.md)

---

**Welcome to iTutor! 🎓**



