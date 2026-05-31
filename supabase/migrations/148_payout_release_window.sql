-- ============================================================
-- MIGRATION 148: PAYOUT RELEASE WINDOW
-- iTutor Database
-- ============================================================
--
-- Bridges the gap between the existing escrow trigger (mig 129,
-- charge → ledger 'owed' + tutor_balances.pending) and the new
-- bank-CSV pipeline (mig 147, ledger 'release_ready' → batch →
-- 'released').
--
-- Adds an RPC that, in one transaction:
--   1. Selects payout_ledger rows with status='owed' whose underlying
--      sessions.charged_at is older than the configured grace window.
--   2. Flips those rows to status='release_ready'.
--   3. Shifts each tutor's tutor_balances: pending_ttd → available_ttd.
--
-- The companion cron at /api/cron/flip-payouts-release-ready calls
-- this RPC daily. Grace hours come from the PAYOUT_GRACE_HOURS env
-- var (default 168 = 7 days, matching LuniPay's settlement floor).
--
-- Idempotent: status guard means re-running on the same window is
-- a no-op for already-flipped rows.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION flip_owed_to_release_ready(p_grace_hours int DEFAULT 168)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff         timestamptz := now() - (p_grace_hours::text || ' hours')::interval;
  v_lines_flipped  int := 0;
  v_tutors_updated int := 0;
  v_total_amount   numeric := 0;
BEGIN
  IF p_grace_hours IS NULL OR p_grace_hours < 0 THEN
    RAISE EXCEPTION 'p_grace_hours must be a non-negative integer';
  END IF;

  -- Single statement: flip ledger rows, aggregate per tutor, upsert
  -- tutor_balances. All data-modifying CTEs share one snapshot, so we
  -- can't double-count even under concurrent runs.
  WITH flipped AS (
    UPDATE payout_ledger pl
    SET status = 'release_ready', updated_at = now()
    WHERE pl.status = 'owed'
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = pl.session_id
          AND s.charged_at IS NOT NULL
          AND s.charged_at < v_cutoff
      )
    RETURNING pl.tutor_id, pl.amount_ttd
  ),
  per_tutor AS (
    SELECT tutor_id, SUM(amount_ttd) AS total
    FROM flipped
    GROUP BY tutor_id
  ),
  balance_upsert AS (
    INSERT INTO tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
    SELECT tutor_id, 0, total, now() FROM per_tutor
    ON CONFLICT (tutor_id) DO UPDATE
    SET pending_ttd   = GREATEST(tutor_balances.pending_ttd - EXCLUDED.available_ttd, 0),
        available_ttd = tutor_balances.available_ttd + EXCLUDED.available_ttd,
        last_updated  = now()
    RETURNING tutor_id
  )
  SELECT
    (SELECT COUNT(*)::int FROM flipped),
    (SELECT COUNT(*)::int FROM balance_upsert),
    (SELECT COALESCE(SUM(amount_ttd), 0) FROM flipped)
  INTO v_lines_flipped, v_tutors_updated, v_total_amount;

  RAISE NOTICE 'flip_owed_to_release_ready: cutoff=% lines=% tutors=% total=%',
    v_cutoff, v_lines_flipped, v_tutors_updated, v_total_amount;

  RETURN jsonb_build_object(
    'cutoff',           v_cutoff,
    'grace_hours',      p_grace_hours,
    'lines_flipped',    v_lines_flipped,
    'tutors_updated',   v_tutors_updated,
    'total_amount_ttd', v_total_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION flip_owed_to_release_ready(int) TO service_role;

-- ============================================================
-- VERIFICATION (commented; run by hand if needed)
-- ============================================================
-- Dry-run with a tiny window — should return 0 lines if nothing's
-- old enough yet:
--   SELECT flip_owed_to_release_ready(0);
--
-- Inspect:
--   SELECT status, COUNT(*) FROM payout_ledger GROUP BY status;
--   SELECT tutor_id, pending_ttd, available_ttd FROM tutor_balances;

COMMIT;
