-- ============================================================
-- MIGRATION 205: RELEASE SUBSCRIPTION-SOURCED PAYOUTS
-- iTutor Database
-- ============================================================
--
-- BUG BEING FIXED (live, with money stuck behind it):
--   flip_owed_to_release_ready only ever flipped rows that join to a
--   `sessions` row:
--
--     WHERE pl.status = 'owed'
--       AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = pl.session_id ...)
--
--   Group-class money never has a session. fn_activate_subscription
--   (migration 160) writes payout_ledger rows keyed by
--   subscription_payment_id with session_id NULL, so the EXISTS can
--   never match and those rows stay 'owed' forever. The CSV export
--   selects status='release_ready', so they are never exported and
--   the tutor is never paid.
--
--   Production at the time of writing: the ONLY row in payout_ledger
--   is a group-subscription row, TT$140, 'owed' since 2026-08-04.
--   That is a real tutor who was never going to be paid.
--
-- WHAT CHANGES:
--   The session branch is untouched — 1:1 payouts keep behaving
--   exactly as before. A second branch releases subscription-sourced
--   rows once the payment itself is older than the grace window.
--
-- SECURE-YOUR-SPOT INTERACTION:
--   A secured spot is held money. Its ledger row is 'owed' like any
--   other, so without a guard this fix would release it after the
--   7-day grace instead of after the first month is delivered. The
--   subscription branch therefore refuses to flip while the enrolment
--   is still SECURED and its release_date has not arrived.
--
--   A SECURED enrolment with release_date NULL is never released.
--   That is deliberate: money we cannot date is money we do not pay
--   out.
--
-- STILL EXCLUDED, unchanged: admin_hold rows, because the whole
-- function only looks at status='owed'. That is what makes the
-- payout_cases quarantine (migration 168) gate releases for free.
--
-- TIMEZONE: release_date is compared in Trinidad local time. On a UTC
-- server CURRENT_DATE rolls over at 20:00 AST, which would release
-- money on the evening before its release date.
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
  v_today          date        := (now() AT TIME ZONE 'America/Port_of_Spain')::date;
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
      AND (
        -- 1:1 sessions — unchanged
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = pl.session_id
            AND s.charged_at IS NOT NULL
            AND s.charged_at < v_cutoff
        )
        -- Group classes: subscriptions and secured spots
        OR EXISTS (
          SELECT 1
          FROM subscription_payments sp
          LEFT JOIN group_enrollments ge ON ge.id = sp.enrollment_id
          WHERE sp.id = pl.subscription_payment_id
            AND sp.status  = 'PAID'
            AND sp.paid_at IS NOT NULL
            AND sp.paid_at < v_cutoff
            AND (
              -- not a secured spot: grace window is the only gate
              ge.id IS NULL
              OR ge.status <> 'SECURED'
              -- secured: the held month must have been delivered
              OR (ge.release_date IS NOT NULL AND ge.release_date <= v_today)
            )
        )
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

  RAISE NOTICE 'flip_owed_to_release_ready: cutoff=% today=% lines=% tutors=% total=%',
    v_cutoff, v_today, v_lines_flipped, v_tutors_updated, v_total_amount;

  RETURN jsonb_build_object(
    'cutoff',           v_cutoff,
    'grace_hours',      p_grace_hours,
    'lines_flipped',    v_lines_flipped,
    'tutors_updated',   v_tutors_updated,
    'total_amount_ttd', v_total_amount
  );
END;
$$;

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- Dry run — which rows WOULD flip, without flipping them:
--
-- SELECT pl.id, pl.amount_ttd, pl.session_id, pl.subscription_payment_id
-- FROM payout_ledger pl
-- WHERE pl.status = 'owed'
--   AND EXISTS (SELECT 1 FROM subscription_payments sp
--               LEFT JOIN group_enrollments ge ON ge.id = sp.enrollment_id
--               WHERE sp.id = pl.subscription_payment_id
--                 AND sp.status = 'PAID' AND sp.paid_at < now() - interval '168 hours'
--                 AND (ge.id IS NULL OR ge.status <> 'SECURED'
--                      OR (ge.release_date IS NOT NULL AND ge.release_date <= current_date)));
--
-- Then: SELECT flip_owed_to_release_ready(168);
