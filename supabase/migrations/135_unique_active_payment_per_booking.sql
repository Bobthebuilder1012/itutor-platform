-- ============================================================
-- MIGRATION 135: ONE ACTIVE PAYMENT PER BOOKING
-- iTutor Database
-- ============================================================
--
-- Prevents duplicate `payments` rows for the same booking_id
-- when a student double-clicks Pay (or the initiate route is
-- otherwise called twice concurrently).
--
-- The /api/payments/lunipay/initiate route now also checks for
-- an existing active payment in application code and returns
-- the same hosted checkout URL. This unique index is the DB-
-- level backstop for the race window between the lookup and
-- the insert.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 0: Guarantee lifecycle columns exist
-- ============================================================
-- These columns are owned by migration 134, but we add them again
-- defensively so this migration succeeds even on databases where
-- 134 was applied before the lifecycle columns were folded into it.
-- All ADD COLUMN IF NOT EXISTS are no-ops when the column already
-- exists, so this is safe to run repeatedly.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- ============================================================
-- STEP 1: Cancel any pre-existing duplicate active payments
-- ============================================================
-- For each booking_id that already has more than one payment in
-- `initiated` or `requires_action`, keep only the newest row and
-- cancel the rest. Without this, the CREATE UNIQUE INDEX below
-- would fail on environments that already accumulated duplicates.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY booking_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM payments
  WHERE status IN ('initiated', 'requires_action')
)
UPDATE payments
SET status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = COALESCE(cancel_reason, 'duplicate_active_payment_cleanup')
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================
-- STEP 2: Partial unique index on active payments per booking
-- ============================================================
-- Allows unlimited terminal-state rows (succeeded, failed,
-- cancelled, refunded) for retries and history, but enforces
-- exactly one open payment attempt per booking at a time.

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_per_booking
  ON payments (booking_id)
  WHERE status IN ('initiated', 'requires_action');

-- ============================================================
-- VERIFICATION (commented; run by hand if needed)
-- ============================================================
-- SELECT booking_id, count(*) FROM payments
-- WHERE status IN ('initiated', 'requires_action')
-- GROUP BY booking_id HAVING count(*) > 1;
-- Expected: 0 rows.

COMMIT;
