# Error Report: Verification Approve/Revoke Not Persisting

**Date:** 2026-02-18  
**Components:** Admin verification (approve, revoke, Verified iTutors list)  
**Symptoms:** Approved tutors not showing as verified; revoke reports success but status unchanged.

---

## Summary

1. **Approved tutors not showing as verified** – After an admin approved a verification request, the tutor did not appear on the Verified iTutors page or as verified on the platform.
2. **Previously approved requests still not verified** – Tutors approved before the fix remained unverified in the database.
3. **Revoke not persisting** – Admin revoked verification and saw “Verification revoked successfully,” but the tutor remained verified (badge and list unchanged).

In all cases the API returned success but the `profiles` table was not updated because Row Level Security (RLS) was blocking the updates when using the session (anon) Supabase client.

---

## Root Cause

Verification approve and revoke routes used the **session Supabase client** (anon key + admin cookies) for:

- **Approve:** `profiles` update setting `tutor_verification_status = 'VERIFIED'` and `tutor_verified_at`.
- **Revoke:** `profiles` update clearing verified status, plus `tutor_verified_subjects` and `notifications` writes.

Under RLS, these operations can **affect 0 rows** while PostgREST still returns HTTP 200 and no error. The app then showed success even though the database was unchanged.

The Verified iTutors page also queried `profiles` with the **browser Supabase client**, so any RLS or data inconsistency could keep the list empty even when some tutors were correctly updated.

---

## Fixes Applied

### 1. Approve route – service role for profile and email

**File:** `app/api/admin/verification/requests/[id]/approve/route.ts`

- Use **service role** client (`getServiceClient()`) for:
  - Updating `profiles`: `tutor_verification_status = 'VERIFIED'`, `tutor_verified_at = now`.
  - Fetching tutor `email`/`full_name` for the congratulations email.
- Session client is still used for request/notification writes that are already allowed by RLS.

Result: Approval always updates the tutor’s profile so they show as verified everywhere.

### 2. Verified iTutors list – API with service role

**New file:** `app/api/admin/verification/verified-tutors/route.ts`

- **GET** endpoint (admin/reviewer only) that uses the **service role** to read `profiles` where `role = 'tutor'` and `tutor_verification_status = 'VERIFIED'`.
- Returns the same enriched list (subject count, booking count, ratings) the UI needs.

**File:** `app/reviewer/verified-tutors/page.tsx`

- Page now fetches from **`/api/admin/verification/verified-tutors`** instead of querying Supabase from the client.
- List no longer depends on RLS for reading other users’ profiles.

Result: Verified iTutors list always reflects the database.

### 3. Backfill for previously approved requests

**New file:** `scripts/sync_approved_verification_to_profiles.sql`

- One-time SQL script for Supabase SQL Editor.
- Updates `profiles` to `tutor_verification_status = 'VERIFIED'` and sets `tutor_verified_at` for every tutor who has an **APPROVED** verification request but is not already VERIFIED.
- Run manually to fix tutors approved before the code fix.

### 4. Revoke route – service role for all writes

**File:** `app/api/admin/verification/revoke/route.ts`

- Use **service role** client for:
  - **profiles:** set `tutor_verification_status = 'REJECTED'`, `tutor_verified_at = null` (schema does not allow `null` for status; REJECTED is used for revoked).
  - **tutor_verified_subjects:** set `is_public = false` for that tutor.
  - **notifications:** insert VERIFICATION_REVOKED for the tutor.
- Session client is no longer used for these writes.

Result: Revoke always updates the database so the tutor is removed from the verified list and no longer shown as verified on the platform.

---

## Verification

- New approvals: tutor appears on Verified iTutors and as verified on the platform.
- Run `scripts/sync_approved_verification_to_profiles.sql` once to fix previously approved tutors.
- Revoke: tutor disappears from Verified iTutors and verified badge/status is removed on the platform.

---

## Recommendation

For admin/reviewer actions that must reliably change `profiles` or other RLS‑protected tables, use the **service role** client in the API route so success is not dependent on RLS policies. Keep session client for auth and for operations that are intended to be subject to RLS.
