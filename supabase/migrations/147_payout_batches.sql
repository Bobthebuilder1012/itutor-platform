-- ============================================================
-- MIGRATION 147: PAYOUT BATCHES (BANK CSV PIPELINE)
-- iTutor Database
-- ============================================================
--
-- Adds the platform-side payout pipeline. iTutor is merchant of
-- record on LuniPay; tutor earnings accumulate in tutor_balances
-- and payout_ledger from the existing trigger (mig 129). This
-- migration introduces the batch concept so an admin can:
--
--   1. Generate a CSV of all release_ready ledger items
--   2. Send the CSV to the bank for bulk transfer
--   3. Mark the batch paid → ledger flips to 'released',
--      tutor_balances.available_ttd is decremented atomically
--
-- Purely additive. Existing payout flow unchanged.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Bank-detail columns on tutor_payout_accounts
-- ============================================================
-- Existing columns (mig 020): payout_name, payout_account_identifier,
-- payout_metadata jsonb. We add explicit columns rather than relying
-- on jsonb so the CSV export can join cleanly and the admin payouts
-- page can flag missing fields.

ALTER TABLE tutor_payout_accounts
  ADD COLUMN IF NOT EXISTS bank_name      text,
  ADD COLUMN IF NOT EXISTS branch         text,
  ADD COLUMN IF NOT EXISTS account_type   text
    CHECK (account_type IN ('chequing','savings')),
  ADD COLUMN IF NOT EXISTS verified_at    timestamptz;

-- ============================================================
-- STEP 2: payout_batches
-- ============================================================
-- One row per CSV the admin exports. Status lifecycle:
--   exported → paid (admin confirms bank transfer)
--   exported → cancelled (admin scraps the batch before sending)

CREATE TABLE IF NOT EXISTS payout_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  total_amount_ttd  numeric(12,2) NOT NULL DEFAULT 0,
  line_count        int NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'exported'
    CHECK (status IN ('exported','paid','cancelled')),
  csv_filename      text,
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_status
  ON payout_batches (status);

CREATE INDEX IF NOT EXISTS idx_payout_batches_generated_at
  ON payout_batches (generated_at DESC);

-- ============================================================
-- STEP 3: Link payout_ledger to a batch + record release time
-- ============================================================

ALTER TABLE payout_ledger
  ADD COLUMN IF NOT EXISTS batch_id    uuid REFERENCES payout_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payout_ledger_batch_id
  ON payout_ledger (batch_id) WHERE batch_id IS NOT NULL;

-- ============================================================
-- STEP 4: RLS — admin-only on batches; tutors can read their own
-- payout account (already covered by mig 023 policies).
-- ============================================================

ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payout batches" ON payout_batches;
CREATE POLICY "Admins can view payout batches"
ON payout_batches FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

DROP POLICY IF EXISTS "Admins can manage payout batches" ON payout_batches;
CREATE POLICY "Admins can manage payout batches"
ON payout_batches FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

DROP POLICY IF EXISTS "Service role full access to payout batches" ON payout_batches;
CREATE POLICY "Service role full access to payout batches"
ON payout_batches FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Admin read access on payout_ledger (existing policies cover tutor/student/service)
DROP POLICY IF EXISTS "Admins can view all payout ledger" ON payout_ledger;
CREATE POLICY "Admins can view all payout ledger"
ON payout_ledger FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

-- Admin read access on tutor_payout_accounts (so the export query joins)
DROP POLICY IF EXISTS "Admins can view all payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Admins can view all payout accounts"
ON tutor_payout_accounts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

-- Admin read access on tutor_balances
DROP POLICY IF EXISTS "Admins can view all tutor balances" ON tutor_balances;
CREATE POLICY "Admins can view all tutor balances"
ON tutor_balances FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

-- ============================================================
-- STEP 5: Atomic mark-paid RPC
-- ============================================================
-- Wraps the released-state transition + balance decrement in a
-- single transaction so a partial failure can't leave ledger and
-- balances out of sync.

CREATE OR REPLACE FUNCTION mark_payout_batch_paid(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch payout_batches;
  v_count int;
BEGIN
  SELECT * INTO v_batch FROM payout_batches WHERE id = p_batch_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status <> 'exported' THEN
    RAISE EXCEPTION 'Batch % is not in exported status (current: %)',
      p_batch_id, v_batch.status;
  END IF;

  -- Decrement each tutor's available balance by the sum of their
  -- ledger items in this batch.
  UPDATE tutor_balances tb
  SET
    available_ttd = available_ttd - sub.total,
    last_updated  = now()
  FROM (
    SELECT tutor_id, SUM(amount_ttd) AS total
    FROM payout_ledger
    WHERE batch_id = p_batch_id AND status = 'release_ready'
    GROUP BY tutor_id
  ) sub
  WHERE tb.tutor_id = sub.tutor_id;

  -- Flip ledger items to released.
  UPDATE payout_ledger
  SET
    status      = 'released',
    released_at = now(),
    updated_at  = now()
  WHERE batch_id = p_batch_id AND status = 'release_ready';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Stamp the batch as paid.
  UPDATE payout_batches
  SET status = 'paid', paid_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'released_count', v_count,
    'total_amount_ttd', v_batch.total_amount_ttd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mark_payout_batch_paid(uuid) TO service_role;

COMMIT;
