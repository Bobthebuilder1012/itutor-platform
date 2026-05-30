-- ============================================================
-- 154_payout_batch_atomic.sql
-- ============================================================
-- Audit Medium #14: the admin payout export issued INSERT
-- payout_batches and UPDATE payout_ledger as two separate REST
-- calls. A crash / timeout between them left an empty batch row
-- behind, and concurrent exports could double-claim the same
-- release_ready ledger rows.
--
-- This RPC wraps both writes in a single transaction so:
--   - either the batch is created with all its ledger lines
--     stamped, or nothing is created at all,
--   - the ledger update guards on (status='release_ready' AND
--     batch_id IS NULL) so a row already claimed by a prior batch
--     can't be silently re-batched.
--
-- Returns the new batch row + the ids that were actually stamped,
-- so the caller can build the CSV against exactly what landed.
-- ============================================================


CREATE OR REPLACE FUNCTION public.create_payout_batch_atomic(
  p_generated_by      uuid,
  p_total_amount_ttd  numeric,
  p_line_count        int,
  p_csv_filename      text,
  p_ledger_ids        uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id   uuid;
  v_generated_at timestamptz;
  v_stamped_ids uuid[];
BEGIN
  IF p_ledger_ids IS NULL OR array_length(p_ledger_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_ledger_ids';
  END IF;

  -- Create the batch row.
  INSERT INTO public.payout_batches (
    generated_by,
    total_amount_ttd,
    line_count,
    status,
    csv_filename
  ) VALUES (
    p_generated_by,
    p_total_amount_ttd,
    p_line_count,
    'exported',
    p_csv_filename
  )
  RETURNING id, generated_at INTO v_batch_id, v_generated_at;

  -- Stamp the ledger lines, but only those still eligible. If a
  -- concurrent export already claimed some of them, those won't
  -- update and we'll return a smaller stamped list â€” the caller
  -- can decide whether the partial result is acceptable.
  WITH stamped AS (
    UPDATE public.payout_ledger
       SET batch_id   = v_batch_id,
           updated_at = now()
     WHERE id = ANY(p_ledger_ids)
       AND status = 'release_ready'
       AND batch_id IS NULL
     RETURNING id
  )
  SELECT array_agg(id) INTO v_stamped_ids FROM stamped;

  IF v_stamped_ids IS NULL OR array_length(v_stamped_ids, 1) IS NULL THEN
    -- Nothing got stamped â€” concurrent batch claimed everything.
    -- Roll the transaction back by raising; the caller surfaces it.
    RAISE EXCEPTION 'no_eligible_lines';
  END IF;

  RETURN jsonb_build_object(
    'batch_id',         v_batch_id,
    'generated_at',     v_generated_at,
    'total_amount_ttd', p_total_amount_ttd,
    'line_count',       array_length(v_stamped_ids, 1),
    'status',           'exported',
    'csv_filename',     p_csv_filename,
    'stamped_ledger_ids', to_jsonb(v_stamped_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payout_batch_atomic(uuid, numeric, int, text, uuid[]) TO service_role;


-- ============================================================
-- Verification:
--   SELECT proname FROM pg_proc
--    WHERE proname = 'create_payout_batch_atomic';
--   -- 1 row
-- ============================================================
