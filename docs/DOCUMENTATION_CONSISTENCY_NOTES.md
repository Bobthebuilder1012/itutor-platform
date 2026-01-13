# Documentation Consistency Review

**Date**: January 2026  
**Reviewer**: Documentation Team  
**Purpose**: Cross-check new CTO handover docs with existing repo documentation

---

## Review Summary

The following consistency checks were performed between the newly created CTO handover documentation and existing repository documentation:

### ✅ Verified Consistent

1. **Next.js Version**: Confirmed 14.0.4 (matches `package.json`)
2. **Target Market**: Trinidad & Tobago, TTD currency (confirmed across all docs)
3. **Database Migrations**: Correctly referenced 63 migrations in `src/supabase/migrations/`
4. **Supabase Usage**: Confirmed platform uses Next.js API routes, NOT Supabase Edge Functions
5. **Auth Flow**: OAuth callback handling matches implementation in `app/auth/callback/route.ts`
6. **Payment Gateway**: WiPay integration correctly documented (webhook + initiate endpoints)
7. **Vercel Deployment**: Auto-deploy from GitHub `main` branch confirmed
8. **Cron Jobs**: Correctly documented `/api/cron/process-charges` running every minute
9. **RLS Policies**: Confirmed all tables have RLS enabled per migrations
10. **Storage Buckets**: `avatars` and `tutor-verifications` correctly documented

---

## 🔧 Corrections Made

### 1. Platform Fee Structure (CRITICAL CORRECTION)

**Inconsistency Found**:
- **Old Documentation** (`README-BACKEND.md`): Claimed "90/10 split" (90% tutor, 10% platform)
- **Actual Implementation** (`src/supabase/migrations/021_payment_functions.sql`): Uses tiered fees

**Correct Implementation** (as of January 2026):
```sql
-- From compute_platform_fee() function:
- Bookings < $50 TTD    => 10% platform fee (90% to tutor)
- Bookings $50-$199 TTD => 15% platform fee (85% to tutor)
- Bookings ≥ $200 TTD   => 20% platform fee (80% to tutor)
```

**Action Taken**:
- Updated `docs/CTO_HANDOVER.md` to reflect tiered fee structure
- Noted in "Revenue Split" sections throughout the document

**Recommendation**:
- Consider updating `README-BACKEND.md` to match current implementation (or mark as historical/outdated)

---

## 📋 Documentation Hierarchy

### Primary (Authoritative)

1. **`docs/CTO_HANDOVER.md`** - Comprehensive platform overview (NEW, January 2026)
2. **`docs/RUNBOOK.md`** - Operational procedures (NEW, January 2026)
3. **`src/supabase/SCHEMA_SUMMARY.md`** - Database schema reference (comprehensive)
4. **`src/supabase/FLOW_SUMMARY.md`** - End-to-end data flows (detailed)
5. **`src/supabase/RLS_IMPLEMENTATION_GUIDE.md`** - RLS policy reference

### Secondary (Historical/Feature-Specific)

1. **`README-BACKEND.md`** - Historical backend overview (⚠️ Contains outdated 90/10 split claim)
2. **`FRONTEND_README.md`** - Frontend setup guide (accurate but basic)
3. **`SETUP.md`** - Initial setup instructions (accurate)
4. **`PAYMENTS_SYSTEM_README.md`** - Detailed payments implementation (✅ Accurate tiered fees)
5. **Feature-specific `.md` files** - Implementation guides for specific features

---

## ⚠️ Outdated Documentation

The following files contain outdated or potentially misleading information:

### `README-BACKEND.md`

**Issue**: References "90/10 split" throughout, but actual implementation uses tiered fees  
**Status**: Historical document, reflects early architecture decisions  
**Recommendation**: Add header: "⚠️ Historical Document - See `docs/CTO_HANDOVER.md` for current architecture"

**Specific Outdated Claims**:
- Line 20-21: References `confirm-payment` Edge Function (platform uses API routes)
- Line 51: "Confirm payment, apply 90/10 split" (should be "tiered fee")
- Line 144: "Inserts payment record with 90/10 split" (inaccurate)

---

## ✅ Recommendations for Future

1. **Primary Documentation**: Direct new developers to:
   - `docs/CTO_HANDOVER.md` (architecture, operations)
   - `docs/RUNBOOK.md` (day-to-day tasks)
   - `src/supabase/SCHEMA_SUMMARY.md` (data model)

2. **Deprecate or Update**:
   - Mark `README-BACKEND.md` as historical
   - OR update it to match current implementation

3. **Single Source of Truth**:
   - For payment fees: `src/supabase/migrations/021_payment_functions.sql` (code is truth)
   - For schema: Migration files in `src/supabase/migrations/`
   - For deployment: `vercel.json`, `next.config.js`, and Vercel dashboard

4. **Documentation Review Cadence**:
   - Review quarterly (especially after major feature releases)
   - Update CTO handover when architecture changes
   - Keep RUNBOOK.md up-to-date with operational procedures

---

## Cross-Reference Table

| Topic | Primary Doc | Secondary Docs |
|-------|-------------|----------------|
| **Architecture** | `docs/CTO_HANDOVER.md` | `README-BACKEND.md` (outdated) |
| **Database Schema** | `src/supabase/SCHEMA_SUMMARY.md` | Migration files (source of truth) |
| **Payment Flows** | `docs/CTO_HANDOVER.md`, `PAYMENTS_SYSTEM_README.md` | - |
| **Deployment** | `docs/CTO_HANDOVER.md`, `docs/RUNBOOK.md` | - |
| **Local Setup** | `docs/RUNBOOK.md`, `SETUP.md` | `FRONTEND_README.md` |
| **RLS Policies** | `src/supabase/RLS_IMPLEMENTATION_GUIDE.md` | Migration files |
| **Data Flows** | `src/supabase/FLOW_SUMMARY.md` | - |

---

## Conclusion

The newly created CTO handover documentation (`docs/CTO_HANDOVER.md` and `docs/RUNBOOK.md`) is **consistent with the actual codebase implementation** and provides an accurate representation of the platform as of January 2026.

**One critical correction was made**: The platform fee structure was updated from the outdated "90/10 flat split" to the correct **tiered fee structure** (10%/15%/20% based on booking amount).

All new documentation cross-references existing authoritative sources (`src/supabase/*.md` files) and provides additional context for operational procedures, tooling workflows, and incident response.

---

**Reviewed By**: Documentation Team  
**Date**: January 2026  
**Status**: ✅ Complete



