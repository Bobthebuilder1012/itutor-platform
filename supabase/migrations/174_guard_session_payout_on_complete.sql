-- ============================================================
-- 174_guard_session_payout_on_complete.sql
-- ============================================================
-- Adds a status guard to fn_create_earning_on_charge so that
-- payout_ledger rows are ONLY created when the session is
-- confirmed as COMPLETED or COMPLETED_ASSUMED. This prevents
-- premature payouts (e.g. if charged_at is set manually or via
-- test tools before the session actually occurs).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_create_earning_on_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment   RECORD;
  v_ledger_id uuid;
  v_case_id   uuid;
  v_existing_case  RECORD;
  v_open_claim     RECORD;
BEGIN
  -- Only fire when charged_at transitions from NULL → a value
  -- AND the session is confirmed as completed (guard against premature payouts)
  IF NEW.charged_at IS NOT NULL
     AND OLD.charged_at IS NULL
     AND NEW.status IN ('COMPLETED', 'COMPLETED_ASSUMED')
  THEN

    -- Validate financials are present and sensible
    IF NEW.payout_amount_ttd IS NULL OR NEW.payout_amount_ttd <= 0 THEN
      RAISE WARNING '[fn_create_earning_on_charge] Zero payout for session_id=%. Skipping.', NEW.id;
      RETURN NEW;
    END IF;

    -- Verify a succeeded payment exists for this booking
    SELECT p.id INTO v_payment
    FROM payments p
    WHERE p.booking_id = NEW.booking_id
      AND p.status IN ('succeeded', 'partially_refunded')
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE WARNING '[fn_create_earning_on_charge] No succeeded payment found for booking_id=%, session_id=%. Skipping ledger creation.',
        NEW.booking_id, NEW.id;
      RETURN NEW;
    END IF;

    -- Block payout if the session was already decided against the tutor or refunded.
    IF EXISTS (
      SELECT 1 FROM noshow_claims
      WHERE session_id = NEW.id AND admin_verdict IN ('tutor_noshow','tie')
    ) OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.booking_id = NEW.booking_id AND p.status IN ('refunded','partially_refunded')
    ) THEN
      RETURN NEW;
    END IF;

    -- Priority 1: existing payout_case awaiting its ledger row (pre-ledger hold)
    SELECT id, hold_reason INTO v_existing_case
    FROM payout_cases
    WHERE session_id = NEW.id
      AND payout_ledger_id IS NULL
      AND status IN ('open','under_review')
    LIMIT 1;

    IF v_existing_case.id IS NOT NULL THEN
      INSERT INTO payout_ledger (session_id, tutor_id, amount_ttd, status, hold_reason, blocked_at)
        VALUES (NEW.id, NEW.tutor_id, NEW.payout_amount_ttd, 'admin_hold', v_existing_case.hold_reason, now())
        RETURNING id INTO v_ledger_id;

      UPDATE payout_cases SET payout_ledger_id = v_ledger_id, updated_at = now()
        WHERE id = v_existing_case.id;
      UPDATE payout_ledger SET case_id = v_existing_case.id WHERE id = v_ledger_id;

    ELSE
      -- Priority 2: open noshow_claim (no case yet)
      SELECT id, claimant_id INTO v_open_claim
      FROM noshow_claims
      WHERE session_id = NEW.id
        AND status IN ('awaiting_response','pending_admin')
      LIMIT 1;

      IF v_open_claim.id IS NOT NULL THEN
        INSERT INTO payout_ledger (session_id, tutor_id, amount_ttd, status, hold_reason, blocked_at)
          VALUES (NEW.id, NEW.tutor_id, NEW.payout_amount_ttd, 'admin_hold', 'student_reported_tutor_no_show', now())
          RETURNING id INTO v_ledger_id;

        INSERT INTO payout_cases (payout_ledger_id, session_id, noshow_claim_id, claimant_id, tutor_id, hold_reason, status)
          VALUES (v_ledger_id, NEW.id, v_open_claim.id, v_open_claim.claimant_id, NEW.tutor_id, 'student_reported_tutor_no_show', 'open')
          RETURNING id INTO v_case_id;

        UPDATE payout_ledger SET case_id = v_case_id WHERE id = v_ledger_id;

      ELSE
        -- Normal path: session completed cleanly, create owed ledger row
        INSERT INTO payout_ledger (session_id, tutor_id, amount_ttd, status)
          VALUES (NEW.id, NEW.tutor_id, NEW.payout_amount_ttd, 'owed')
          RETURNING id INTO v_ledger_id;

        INSERT INTO tutor_balances (tutor_id, pending_ttd, available_ttd)
          VALUES (NEW.tutor_id, NEW.payout_amount_ttd, 0)
          ON CONFLICT (tutor_id) DO UPDATE
            SET pending_ttd = tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
                last_updated = now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
