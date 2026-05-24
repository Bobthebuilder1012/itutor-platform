-- ============================================================
-- 152_partial_refunds.sql
-- ============================================================
-- Foundation for the cancellation / no-show payment flow.
--
-- 1. Adds partial-refund accounting columns to payments.
-- 2. Extends payments.status to include 'partially_refunded'.
-- 3. Extends sessions.status to include 'NO_SHOW_TUTOR' and
--    'MUTUAL_NON_COMPLETION' (consumed by the admin no-show
--    resolve route).
-- 4. Adds CHECK total_refunded_ttd <= amount_ttd to prevent
--    over-refunds at the DB level even if a buggy caller skips
--    the application-layer guard.
-- 5. Defines apply_refund_side_effects(jsonb) — the atomic RPC
--    that the refund service hands every refund to. Owns the
--    payments status update, the payout_ledger reversal /
--    replacement, and the tutor_balances delta in a single
--    transaction so they can never disagree.
--
-- Out of scope (deferred to follow-on cancellation work):
--   cancellation_events table, no-show claim tables, rolling
--   counters, auto-rating, strikes. None of those have payment
--   dependencies.
--
-- Canonical cancel_reason taxonomy used by new code (column is
-- free-form text — no CHECK to avoid breaking legacy values like
-- 'refunded_by_admin' and 'duplicate_active_payment_cleanup'):
--   student_cancelled, tutor_cancelled,
--   tutor_noshow, tie_inconclusive, slot_conflict,
--   student_late_cancel, student_noshow, admin_manual.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Partial-refund accounting columns
-- ------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_amount_ttd   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retained_amount_ttd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunded_ttd  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at         timestamptz;

-- Cumulative refund cannot exceed the original charge.
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_total_refunded_within_amount;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_total_refunded_within_amount
  CHECK (total_refunded_ttd <= amount_ttd + 0.005);

-- ------------------------------------------------------------
-- 2. Extend payments.status to include 'partially_refunded'.
-- ------------------------------------------------------------
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN (
    'initiated',
    'requires_action',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded',
    'cancelled'
  ));

-- ------------------------------------------------------------
-- 3. Extend sessions.status with the two no-show resolutions.
-- ------------------------------------------------------------
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN (
    'SCHEDULED',
    'JOIN_OPEN',
    'COMPLETED_ASSUMED',
    'NO_SHOW_STUDENT',
    'NO_SHOW_TUTOR',
    'MUTUAL_NON_COMPLETION',
    'EARLY_END_SHORT',
    'CANCELLED'
  ));

-- ------------------------------------------------------------
-- 4. apply_refund_side_effects(jsonb)
-- ------------------------------------------------------------
-- Single atomic step the application-layer refund service hands
-- every refund to AFTER the LuniPay call has succeeded. Doing
-- payments + payout_ledger + tutor_balances + sessions in one
-- transaction means the financial state is always consistent
-- regardless of which step fails.
--
-- Caller-provided JSON payload:
--   payment_id                 uuid   (required)
--   refund_amount_ttd          number (required, this refund only)
--   retained_amount_ttd        number (default 0; partial retention)
--   retained_payout_ttd        number (tutor share of retained)
--   retained_platform_fee_ttd  number (platform share of retained)
--   reason                     text   (cancel_reason taxonomy)
--   refund_payload             jsonb  (the LuniPay refund object)
--   session_status_override    text   (optional; e.g. NO_SHOW_STUDENT)
--
-- Returns:
--   {
--     new_payment_status      text,
--     total_refunded_ttd      numeric,
--     ledger_action           text,    -- reverted | replaced | inserted | no_session
--     session_id              uuid,
--     tutor_id                uuid
--   }
--
-- Refuses: ledger row already in 'release_ready' or 'released'
-- (defense in depth — caller must check too).
CREATE OR REPLACE FUNCTION public.apply_refund_side_effects(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id            uuid    := (p_payload->>'payment_id')::uuid;
  v_refund_amount         numeric := (p_payload->>'refund_amount_ttd')::numeric;
  v_retained_amount       numeric := COALESCE((p_payload->>'retained_amount_ttd')::numeric, 0);
  v_retained_payout       numeric := COALESCE((p_payload->>'retained_payout_ttd')::numeric, 0);
  v_retained_platform_fee numeric := COALESCE((p_payload->>'retained_platform_fee_ttd')::numeric, 0);
  v_reason                text    := p_payload->>'reason';
  v_refund_payload        jsonb   := COALESCE(p_payload->'refund_payload', '{}'::jsonb);
  v_session_status        text    := p_payload->>'session_status_override';

  v_payment              record;
  v_session              record;
  v_ledger               record;
  v_session_id           uuid;
  v_tutor_id             uuid;
  v_ledger_id            uuid;

  v_total_refunded       numeric;
  v_new_status           text;
  v_existing_refunds     jsonb;
  v_old_pending_delta    numeric := 0;
  v_new_pending_delta    numeric := 0;
  v_ledger_action        text    := 'no_session';
BEGIN
  IF v_refund_amount IS NULL OR v_refund_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount: %', v_refund_amount;
  END IF;
  IF v_retained_amount < 0 THEN
    RAISE EXCEPTION 'invalid_retained_amount: %', v_retained_amount;
  END IF;

  -- --- 1. Lock + load payment ---
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = v_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found: %', v_payment_id;
  END IF;

  v_total_refunded := COALESCE(v_payment.total_refunded_ttd, 0) + v_refund_amount;

  IF v_total_refunded > v_payment.amount_ttd + 0.005 THEN
    RAISE EXCEPTION 'over_refund: total % would exceed payment amount %',
      v_total_refunded, v_payment.amount_ttd;
  END IF;

  IF v_total_refunded >= v_payment.amount_ttd - 0.005 THEN
    v_new_status := 'refunded';
  ELSE
    v_new_status := 'partially_refunded';
  END IF;

  -- --- 2. Update payment row ---
  v_existing_refunds := COALESCE(v_payment.raw_provider_payload->'refunds', '[]'::jsonb);

  UPDATE public.payments
  SET status              = v_new_status,
      total_refunded_ttd  = v_total_refunded,
      refund_amount_ttd   = v_refund_amount,
      retained_amount_ttd = v_retained_amount,
      refunded_at         = now(),
      cancel_reason       = v_reason,
      raw_provider_payload = jsonb_set(
        COALESCE(v_payment.raw_provider_payload, '{}'::jsonb),
        '{refunds}',
        v_existing_refunds || jsonb_build_array(v_refund_payload)
      )
  WHERE id = v_payment_id;

  -- --- 3. Resolve session via booking (if any) ---
  IF v_payment.booking_id IS NOT NULL THEN
    SELECT s.*
    INTO v_session
    FROM public.sessions s
    WHERE s.booking_id = v_payment.booking_id
    LIMIT 1;
    IF FOUND THEN
      v_session_id := v_session.id;
      v_tutor_id   := v_session.tutor_id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    -- Slot-conflict refund stub or session creation never ran.
    RETURN jsonb_build_object(
      'new_payment_status', v_new_status,
      'total_refunded_ttd', v_total_refunded,
      'ledger_action',      'no_session'
    );
  END IF;

  -- --- 4. Lock + inspect ledger row ---
  SELECT * INTO v_ledger
  FROM public.payout_ledger
  WHERE session_id = v_session_id
  FOR UPDATE;
  IF FOUND THEN
    v_ledger_id := v_ledger.id;
  END IF;

  IF v_ledger_id IS NOT NULL THEN
    -- Defense in depth: the application layer also checks this.
    IF v_ledger.status IN ('release_ready', 'released') THEN
      RAISE EXCEPTION 'ledger_already_advanced: session % ledger status %',
        v_session_id, v_ledger.status;
    END IF;

    IF v_retained_amount > 0 THEN
      -- Partial retention: keep one row per session, replace amount,
      -- flip back to 'owed' if it had previously been reversed.
      UPDATE public.payout_ledger
      SET amount_ttd = v_retained_payout,
          status     = 'owed',
          updated_at = now()
      WHERE id = v_ledger_id;

      v_old_pending_delta := COALESCE(v_ledger.amount_ttd, 0);
      IF v_ledger.status = 'reversed' THEN
        -- A reversed row currently contributes 0 to pending_ttd, so the
        -- "old" delta to subtract is 0, not the row's amount.
        v_old_pending_delta := 0;
      END IF;
      v_new_pending_delta := v_retained_payout;
      v_ledger_action := 'replaced';
    ELSE
      -- Full refund: reverse the row.
      UPDATE public.payout_ledger
      SET status     = 'reversed',
          updated_at = now()
      WHERE id = v_ledger_id;

      v_old_pending_delta := CASE
        WHEN v_ledger.status = 'reversed' THEN 0
        ELSE COALESCE(v_ledger.amount_ttd, 0)
      END;
      v_new_pending_delta := 0;
      v_ledger_action := 'reverted';
    END IF;

    -- --- 5. Apply tutor_balances delta (or insert row if missing) ---
    UPDATE public.tutor_balances
    SET pending_ttd  = GREATEST(pending_ttd - v_old_pending_delta + v_new_pending_delta, 0),
        last_updated = now()
    WHERE tutor_id = v_tutor_id;

    IF NOT FOUND AND v_new_pending_delta > 0 THEN
      INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
      VALUES (v_tutor_id, v_new_pending_delta, 0, now());
    END IF;

  ELSE
    -- No ledger row yet (cron hasn't fired charged_at).
    IF v_retained_amount > 0 THEN
      -- Materialise the retained-share ledger row directly. Mark the
      -- session CANCELLED so the cron's mig 129 trigger never fires
      -- and tries to create a second row (session_id is UNIQUE).
      INSERT INTO public.payout_ledger (
        session_id, tutor_id, amount_ttd, status
      ) VALUES (
        v_session_id, v_tutor_id, v_retained_payout, 'owed'
      );

      INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
      VALUES (v_tutor_id, v_retained_payout, 0, now())
      ON CONFLICT (tutor_id) DO UPDATE
      SET pending_ttd  = public.tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
          last_updated = now();

      -- Reflect retention on the session row so wallet / admin views
      -- show the actual money that moved.
      UPDATE public.sessions
      SET charge_amount_ttd = v_retained_amount,
          payout_amount_ttd = v_retained_payout,
          platform_fee_ttd  = v_retained_platform_fee,
          updated_at        = now()
      WHERE id = v_session_id;

      v_ledger_action := 'inserted';
    ELSE
      v_ledger_action := 'no_session';
    END IF;
  END IF;

  -- --- 6. Optional session status override ---
  -- Default behaviour for full-refund-no-session-row is to mark
  -- CANCELLED so the cron skips it; if the caller passes an explicit
  -- override (e.g. NO_SHOW_STUDENT, NO_SHOW_TUTOR) we honour it.
  IF v_session_status IS NOT NULL THEN
    UPDATE public.sessions
    SET status        = v_session_status,
        cancelled_at  = CASE
          WHEN v_session_status IN ('CANCELLED', 'NO_SHOW_TUTOR', 'MUTUAL_NON_COMPLETION')
            THEN COALESCE(cancelled_at, now())
          ELSE cancelled_at
        END,
        updated_at    = now()
    WHERE id = v_session_id;
  ELSIF v_ledger_id IS NULL AND v_retained_amount = 0 THEN
    -- No override + full refund + no ledger row → CANCEL the session
    -- so the cron doesn't try to charge it later.
    UPDATE public.sessions
    SET status       = 'CANCELLED',
        cancelled_at = COALESCE(cancelled_at, now()),
        updated_at   = now()
    WHERE id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'new_payment_status', v_new_status,
    'total_refunded_ttd', v_total_refunded,
    'ledger_action',      v_ledger_action,
    'session_id',         v_session_id,
    'tutor_id',           v_tutor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_refund_side_effects(jsonb) TO service_role;

COMMIT;

-- ============================================================
-- Verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='payments'
--      AND column_name IN
--        ('refund_amount_ttd','retained_amount_ttd',
--         'total_refunded_ttd','refunded_at');
--   -- 4 rows
--
--   SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conname='payments_status_check';
--   -- ... 'partially_refunded' ...
--
--   SELECT proname FROM pg_proc
--    WHERE proname='apply_refund_side_effects';
--   -- 1 row
-- ============================================================
