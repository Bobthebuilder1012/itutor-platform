-- ============================================================
-- MIGRATION 129: LEDGER CONSOLIDATION (OPTION A) â€” CORRECTED
-- iTutor Database
-- ============================================================
--
-- !! REQUIRES SIGN-OFF FROM JOVAN (payments system owner) !!
--
-- Commits to the event-sourced ledger model by wiring a trigger
-- so that setting sessions.charged_at auto-creates ledger rows.
--
-- This version is matched against the ACTUAL schemas:
--   tutor_earnings  â†’ mig 001 lines 215-267
--   payout_ledger   â†’ mig 020 lines 78-87
--   tutor_balances  â†’ mig 001 lines 272-277
--
-- ACTUAL SCHEMAS (for reference):
--
-- tutor_earnings (
--   id uuid PK,
--   created_at timestamptz NOT NULL DEFAULT now(),
--   tutor_id uuid NOT NULL REFERENCES profiles(id),
--   session_id uuid NOT NULL REFERENCES sessions(id),
--   payment_id uuid NOT NULL REFERENCES payments(id),  â† required!
--   gross_amount_ttd numeric(12,2) NOT NULL CHECK (> 0),
--   tutor_share_ttd numeric(12,2) NOT NULL CHECK (> 0),
--   commission_ttd numeric(12,2) NOT NULL CHECK (>= 0),
--   status text NOT NULL CHECK IN ('EARNED', 'REVERSED'),
--   UNIQUE (payment_id)
-- )
--
-- payout_ledger (
--   id uuid PK,
--   session_id uuid UNIQUE NOT NULL REFERENCES sessions(id),
--   tutor_id uuid NOT NULL REFERENCES profiles(id),
--   amount_ttd numeric(10,2) NOT NULL,
--   status text NOT NULL DEFAULT 'owed'
--     CHECK IN ('owed', 'release_ready', 'released', 'reversed'),
--   created_at timestamptz DEFAULT now(),
--   updated_at timestamptz DEFAULT now()
--   â€” NOTE: no 'type' column exists
-- )
--
-- tutor_balances (
--   tutor_id uuid PK REFERENCES profiles(id),  â† PK is tutor_id, no separate id
--   available_ttd numeric(12,2) NOT NULL DEFAULT 0 CHECK (>= 0),
--   pending_ttd numeric(12,2) NOT NULL DEFAULT 0 CHECK (>= 0),
--   last_updated timestamptz NOT NULL DEFAULT now()
--   â€” NOTE: column is last_updated, not updated_at
-- )
-- ============================================================


-- ============================================================
-- STEP 1: Drop commission_ledger
-- ============================================================
-- 0 code references, 0 inbound FKs. Safe.
-- Commission is derivable: gross_amount_ttd - tutor_share_ttd = commission_ttd

DROP TABLE IF EXISTS commission_ledger CASCADE;

-- ============================================================
-- STEP 2: Create the charge â†’ ledger trigger (corrected)
-- ============================================================
-- When sessions.charged_at transitions from NULL â†’ a value:
--   1. Look up the payment_id from the payments table
--   2. Create a tutor_earnings row (EARNED status)
--   3. Create a payout_ledger row (owed status)
--   4. Upsert tutor_balances (increment pending_ttd + last_updated)
--
-- Field mapping from sessions â†’ ledger tables:
--   sessions.charge_amount_ttd   â†’ tutor_earnings.gross_amount_ttd
--   sessions.payout_amount_ttd   â†’ tutor_earnings.tutor_share_ttd
--   sessions.platform_fee_ttd    â†’ tutor_earnings.commission_ttd
--   sessions.payout_amount_ttd   â†’ payout_ledger.amount_ttd
--   payment_id                   â†’ looked up from payments WHERE booking_id matches

CREATE OR REPLACE FUNCTION fn_create_earning_on_charge()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  -- Only fire when charged_at transitions from NULL to a value
  IF NEW.charged_at IS NOT NULL AND OLD.charged_at IS NULL THEN

    -- Look up the payment_id from the payments table
    -- A session is charged after a successful payment, so there should
    -- be exactly one succeeded payment for this booking.
    SELECT id INTO v_payment_id
    FROM payments
    WHERE booking_id = NEW.booking_id
      AND status = 'succeeded'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no payment found, log a warning and bail out.
    -- This shouldn't happen in normal flow, but we don't want to
    -- crash the session update if the payment record is missing.
    IF v_payment_id IS NULL THEN
      RAISE WARNING '[fn_create_earning_on_charge] No succeeded payment found for booking_id=%, session_id=%. Skipping ledger creation.',
        NEW.booking_id, NEW.id;
      RETURN NEW;
    END IF;

    -- Guard: all money amounts must be positive
    IF COALESCE(NEW.charge_amount_ttd, 0) <= 0
       OR COALESCE(NEW.payout_amount_ttd, 0) <= 0 THEN
      RAISE WARNING '[fn_create_earning_on_charge] Invalid amounts for session_id=%: charge=%, payout=%. Skipping.',
        NEW.id, NEW.charge_amount_ttd, NEW.payout_amount_ttd;
      RETURN NEW;
    END IF;

    -- 1. tutor_earnings row
    -- Maps: gross_amount_ttd â† charge_amount_ttd
    --       tutor_share_ttd  â† payout_amount_ttd
    --       commission_ttd   â† platform_fee_ttd
    --       status           â† 'EARNED' (matches CHECK constraint)
    INSERT INTO tutor_earnings (
      id,
      tutor_id,
      session_id,
      payment_id,
      gross_amount_ttd,
      tutor_share_ttd,
      commission_ttd,
      status
      -- created_at defaults to now()
    )
    VALUES (
      gen_random_uuid(),
      NEW.tutor_id,
      NEW.id,
      v_payment_id,
      NEW.charge_amount_ttd,
      NEW.payout_amount_ttd,
      COALESCE(NEW.platform_fee_ttd, 0),
      'EARNED'
    )
    ON CONFLICT (payment_id) DO NOTHING;
    -- payment_id has UNIQUE constraint â€” if we somehow double-fire, skip silently

    -- 2. payout_ledger row
    -- Maps: amount_ttd â† payout_amount_ttd (what the tutor is owed)
    --       status     â† 'owed' (matches CHECK constraint, is also the DEFAULT)
    -- NOTE: no 'type' column exists on payout_ledger
    INSERT INTO payout_ledger (
      id,
      session_id,
      tutor_id,
      amount_ttd,
      status
      -- created_at, updated_at default to now()
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.tutor_id,
      NEW.payout_amount_ttd,
      'owed'
    )
    ON CONFLICT (session_id) DO NOTHING;
    -- session_id has UNIQUE constraint â€” skip if already exists

    -- 3. Upsert tutor_balances
    -- PK is tutor_id (no separate id column)
    -- Timestamp column is last_updated (not updated_at)
    INSERT INTO tutor_balances (
      tutor_id,
      pending_ttd,
      available_ttd,
      last_updated
    )
    VALUES (
      NEW.tutor_id,
      NEW.payout_amount_ttd,
      0,
      now()
    )
    ON CONFLICT (tutor_id) DO UPDATE SET
      pending_ttd = tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
      last_updated = now();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Attach to sessions table
DROP TRIGGER IF EXISTS trg_create_earning_on_charge ON sessions;
CREATE TRIGGER trg_create_earning_on_charge
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_earning_on_charge();

-- ============================================================
-- STEP 3 (DEFERRED): Drop redundant money columns
-- ============================================================
-- Once the wallet UI reads from tutor_earnings / tutor_balances
-- instead of sessions directly, uncomment these.
--
-- From bookings:
-- ALTER TABLE bookings
--   DROP COLUMN IF EXISTS platform_fee_pct,
--   DROP COLUMN IF EXISTS platform_fee_ttd,
--   DROP COLUMN IF EXISTS tutor_payout_ttd;
--
-- From sessions (only after wallet UI migration):
-- ALTER TABLE sessions
--   DROP COLUMN IF EXISTS charge_amount_ttd,
--   DROP COLUMN IF EXISTS payout_amount_ttd,
--   DROP COLUMN IF EXISTS platform_fee_ttd,
--   DROP COLUMN IF EXISTS platform_fee_pct;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- commission_ledger should be gone:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'commission_ledger';
-- Expected: 0 rows

-- Trigger should exist:
-- SELECT tgname, tgrelid::regclass
-- FROM pg_trigger
-- WHERE tgname = 'trg_create_earning_on_charge';
-- Expected: 1 row, on sessions

-- Dry-run test (DO NOT run on production data â€” use a test session):
-- To verify the trigger works, create a test payment + session,
-- then UPDATE sessions SET charged_at = now() WHERE id = <test_session_id>;
-- Then check:
--   SELECT * FROM tutor_earnings WHERE session_id = '<test_session_id>';
--   SELECT * FROM payout_ledger WHERE session_id = '<test_session_id>';
--   SELECT * FROM tutor_balances WHERE tutor_id = '<test_tutor_id>';

