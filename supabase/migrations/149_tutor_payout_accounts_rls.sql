-- ============================================================
-- MIGRATION 149: TUTOR_PAYOUT_ACCOUNTS — TUTOR WRITE RLS
-- iTutor Database
-- ============================================================
--
-- Mig 020 created tutor_payout_accounts and enabled RLS, but only
-- tutor SELECT and service-role ALL policies were defined. INSERT
-- and UPDATE for the owning tutor were missing — every write went
-- through /api/tutor/payout-account using the service-role client,
-- which works but means we can't safely switch the form to a direct
-- Supabase write later, and any other code path that tries to
-- upsert this table as the user will silently 0-row.
--
-- Adds an explicit tutor-owned write policy. Service-role policies
-- already exist and are unaffected.
-- ============================================================

BEGIN;

-- Idempotent guard
DROP POLICY IF EXISTS "Tutors can upsert their payout account" ON tutor_payout_accounts;
DROP POLICY IF EXISTS "Tutors can delete their payout account" ON tutor_payout_accounts;

CREATE POLICY "Tutors can upsert their payout account"
ON tutor_payout_accounts
FOR ALL
TO authenticated
USING       (tutor_id = auth.uid())
WITH CHECK  (tutor_id = auth.uid());

-- Note: existing select/insert/etc. policies from mig 020 / 023
-- aren't broken — Postgres RLS is permissive (any matching policy
-- grants access). The new ALL policy just covers the write paths
-- that were previously gapped.

COMMIT;
