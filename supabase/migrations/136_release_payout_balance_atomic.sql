-- ============================================================
-- MIGRATION 136: release_payout — atomic balance write
-- iTutor Database
-- ============================================================
--
-- Folds the tutor_balances mutation into release_payout(p_session_id)
-- so the entire payout-release operation is a single transaction
-- with one writer to tutor_balances. Previously /api/payments/
-- lunipay/release issued a separate read-then-write to
-- tutor_balances after the RPC, which is racy under concurrent
-- releases.
--
-- New behavior:
--   1. Look up payout_ledger row (tutor_id, amount_ttd, status)
--   2. If already 'released' → no-op (idempotent)
--   3. Flip payout_ledger.status to 'released'
--   4. Flip sessions.payment_status to 'released'
--   5. Move tutor_balances: pending_ttd -= amount, available_ttd += amount
--
-- Idempotent: CREATE OR REPLACE FUNCTION + status guard.
-- Safe to re-run.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION release_payout(p_session_id uuid)
RETURNS void
AS $$
DECLARE
  v_tutor_id uuid;
  v_amount numeric;
  v_already_released boolean;
BEGIN
  -- Look up the ledger row in a single query.
  SELECT tutor_id, amount_ttd, (status = 'released')
  INTO v_tutor_id, v_amount, v_already_released
  FROM payout_ledger
  WHERE session_id = p_session_id
  LIMIT 1;

  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'Payout ledger entry not found for session %', p_session_id;
  END IF;

  -- Idempotency guard: if already released, do nothing.
  IF v_already_released THEN
    RAISE NOTICE 'Payout for session % already released; skipping', p_session_id;
    RETURN;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payout amount for session %: %', p_session_id, v_amount;
  END IF;

  -- 1. Flip payout_ledger.status
  UPDATE payout_ledger
  SET status = 'released',
      updated_at = now()
  WHERE session_id = p_session_id;

  -- 2. Flip sessions.payment_status (preserves prior behavior)
  UPDATE sessions
  SET payment_status = 'released',
      updated_at = now()
  WHERE id = p_session_id;

  -- 3. Move tutor_balances: pending → available, atomically.
  -- GREATEST(..., 0) defends against the CHECK (pending_ttd >= 0)
  -- constraint in case of historical drift.
  INSERT INTO tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
  VALUES (v_tutor_id, 0, v_amount, now())
  ON CONFLICT (tutor_id) DO UPDATE SET
    pending_ttd   = GREATEST(tutor_balances.pending_ttd - EXCLUDED.available_ttd, 0),
    available_ttd = tutor_balances.available_ttd + EXCLUDED.available_ttd,
    last_updated  = now();

  RAISE NOTICE 'Released payout for session % (tutor %, amount %)',
    p_session_id, v_tutor_id, v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Re-grant (CREATE OR REPLACE preserves grants in modern Postgres,
-- but be explicit for portability).
GRANT EXECUTE ON FUNCTION release_payout(uuid) TO service_role;

-- ============================================================
-- VERIFICATION (commented; run by hand if needed)
-- ============================================================
-- Inspect the new function source:
-- \df+ release_payout
--
-- Smoke-test against a session that has a payout_ledger row in 'owed':
-- SELECT release_payout('<test_session_id>');
-- Then check:
--   SELECT status FROM payout_ledger WHERE session_id = '<test_session_id>';
--     -- Expected: 'released'
--   SELECT pending_ttd, available_ttd FROM tutor_balances WHERE tutor_id = '<tutor_id>';
--     -- Expected: pending decreased by amount, available increased by same.

COMMIT;
