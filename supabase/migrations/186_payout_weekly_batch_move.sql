-- ============================================================
-- MIGRATION 186: WEEKLY PAYOUT "MOVE, DON'T SWEEP" LIFECYCLE
-- iTutor Database
-- ============================================================
--
-- Fixes the Friday 4am "sweep" bug: previously the cron only flipped
-- owed -> release_ready, and a separate manual "Clear CSV" click
-- advanced ledger rows out of the payable view WITHOUT any guarantee
-- that a payout CSV was ever produced or retained. Rows could leave
-- the live view with no file.
--
-- New, human-gated lifecycle ("move, don't sweep"):
--
--   accumulate (live: owed / release_ready, batch_id IS NULL)
--     -> 4am Friday MOVE      -> payout_batches.status='pending_download'
--                                (release_ready rows stamped batch_id +
--                                 isolated_at; they leave the live view)
--     -> download CSV          -> CSV built + RETAINED server-side
--                                 (csv_body, csv_generated_at), batch
--                                 flips pending_download -> exported
--     -> Mark paid             -> ledger release_ready -> released,
--                                 balances debited, batch -> paid
--     -> CSV History weekly folder
--
-- The MOVE never advances ledger STATUS (rows stay release_ready) and
-- never touches tutor_balances, so it does NOT reintroduce the
-- owed->release_ready balance-reconciliation hazard. It only marks
-- which rows belong to "this week's batch".
--
-- Mark-paid is gated on csv_generated_at IS NOT NULL: a batch cannot
-- be finalised until its CSV has actually been generated and retained.
--
-- Purely additive. Existing export / create-batch / mark-paid flows
-- keep working (those routes are updated to also retain the CSV).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. payout_batches: new lifecycle status + retained CSV + window
-- ============================================================
-- status lifecycle is now:
--   pending_download -> exported -> paid
--   pending_download | exported -> cancelled

ALTER TABLE public.payout_batches
  DROP CONSTRAINT IF EXISTS payout_batches_status_check;
ALTER TABLE public.payout_batches
  ADD CONSTRAINT payout_batches_status_check
  CHECK (status IN ('pending_download','exported','paid','cancelled'));

ALTER TABLE public.payout_batches
  ADD COLUMN IF NOT EXISTS csv_body         text,
  ADD COLUMN IF NOT EXISTS csv_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS batch_type       text NOT NULL DEFAULT 'one_on_one'
    CHECK (batch_type IN ('one_on_one','lesson')),
  ADD COLUMN IF NOT EXISTS window_start     timestamptz,
  ADD COLUMN IF NOT EXISTS window_end       timestamptz;

CREATE INDEX IF NOT EXISTS idx_payout_batches_type_status
  ON public.payout_batches (batch_type, status);

-- ============================================================
-- 2. payout_ledger: isolated_at marker (distinct from release flip)
-- ============================================================
-- Set when the weekly MOVE pulls a release_ready row into a batch.
-- Lets us tell "moved into this week's batch" apart from a plain
-- release_ready flip without overloading the status column.

ALTER TABLE public.payout_ledger
  ADD COLUMN IF NOT EXISTS isolated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payout_ledger_isolated_at
  ON public.payout_ledger (isolated_at) WHERE isolated_at IS NOT NULL;

-- ============================================================
-- 3. RPC: move_release_ready_to_weekly_batch
-- ============================================================
-- The 4am Friday MOVE. In ONE transaction:
--   1. Creates a payout_batches row in status 'pending_download'.
--   2. Stamps every eligible release_ready, unbatched ledger row of
--      the requested batch_type with batch_id + isolated_at.
--        - one_on_one : session_id IS NOT NULL
--        - lesson     : subscription_payment_id IS NOT NULL
--      admin_hold / reversed / released / already-batched rows are
--      excluded (status='release_ready' AND batch_id IS NULL).
--   3. Stamps total_amount_ttd (gross sum) + line_count (distinct tutors).
--
-- If nothing is eligible, the empty batch is removed and the RPC
-- returns moved=0 so the cron does not create empty weekly folders.
--
-- Does NOT change ledger status and does NOT touch tutor_balances.
-- ============================================================

CREATE OR REPLACE FUNCTION public.move_release_ready_to_weekly_batch(
  p_generated_by uuid,
  p_batch_type   text    DEFAULT 'one_on_one',
  p_csv_filename text    DEFAULT NULL,
  p_window_start timestamptz DEFAULT NULL,
  p_window_end   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id     uuid;
  v_generated_at timestamptz;
  v_window_end   timestamptz := COALESCE(p_window_end, now());
  v_window_start timestamptz := COALESCE(p_window_start, date_trunc('week', COALESCE(p_window_end, now())));
  v_moved        int := 0;
  v_total        numeric := 0;
  v_tutors       int := 0;
BEGIN
  IF p_batch_type NOT IN ('one_on_one','lesson') THEN
    RAISE EXCEPTION 'invalid_batch_type: %', p_batch_type;
  END IF;

  INSERT INTO public.payout_batches (
    generated_by, status, batch_type,
    window_start, window_end, csv_filename
  ) VALUES (
    p_generated_by, 'pending_download', p_batch_type,
    v_window_start, v_window_end, p_csv_filename
  )
  RETURNING id, generated_at INTO v_batch_id, v_generated_at;

  WITH moved AS (
    UPDATE public.payout_ledger pl
       SET batch_id    = v_batch_id,
           isolated_at = now(),
           updated_at  = now()
     WHERE pl.status = 'release_ready'
       AND pl.batch_id IS NULL
       AND (
         (p_batch_type = 'one_on_one' AND pl.session_id IS NOT NULL)
         OR
         (p_batch_type = 'lesson'     AND pl.subscription_payment_id IS NOT NULL)
       )
     RETURNING pl.tutor_id, pl.amount_ttd
  )
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(amount_ttd), 0),
    COUNT(DISTINCT tutor_id)::int
  INTO v_moved, v_total, v_tutors
  FROM moved;

  IF v_moved = 0 THEN
    -- Nothing eligible this week — don't leave an empty folder behind.
    DELETE FROM public.payout_batches WHERE id = v_batch_id;
    RETURN jsonb_build_object(
      'ok', true, 'moved', 0, 'batch_id', NULL,
      'batch_type', p_batch_type,
      'window_start', v_window_start, 'window_end', v_window_end
    );
  END IF;

  UPDATE public.payout_batches
     SET total_amount_ttd = round(v_total, 2),
         line_count       = v_tutors
   WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'moved',            v_moved,
    'batch_id',         v_batch_id,
    'batch_type',       p_batch_type,
    'generated_at',     v_generated_at,
    'total_amount_ttd', round(v_total, 2),
    'line_count',       v_tutors,
    'window_start',     v_window_start,
    'window_end',       v_window_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_release_ready_to_weekly_batch(uuid, text, text, timestamptz, timestamptz) TO service_role;

-- ============================================================
-- 4. RPC: mark_payout_batch_paid  (re-created WITH download gate)
-- ============================================================
-- Same released-state transition + balance decrement as migration
-- 147, PLUS a hard gate: a batch can only be marked paid once its
-- CSV has been generated and retained (csv_generated_at IS NOT NULL).
-- This is what closes the "swept but never downloaded" hole.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_payout_batch_paid(p_batch_id uuid)
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

  -- Download gate: the CSV must have been generated and retained
  -- before any money is marked paid.
  IF v_batch.csv_generated_at IS NULL THEN
    RAISE EXCEPTION 'csv_not_generated: download the CSV for batch % before marking it paid', p_batch_id;
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

GRANT EXECUTE ON FUNCTION public.mark_payout_batch_paid(uuid) TO service_role;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT proname FROM pg_proc
--  WHERE proname IN ('move_release_ready_to_weekly_batch','mark_payout_batch_paid');
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='payout_batches'
--    AND column_name IN ('csv_body','csv_generated_at','batch_type','window_start','window_end');
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='payout_ledger' AND column_name='isolated_at';

COMMIT;
