-- ============================================================
-- MIGRATION 168: PAYOUT HOLD / EXCEPTION FLOW
-- ============================================================
-- Adds admin_hold as a first-class payout_ledger status and a
-- payout_cases table so disputed payouts are quarantined until
-- admin explicitly resolves them (release / refund / partial).
--
-- Key invariants:
--   - flip_owed_to_release_ready filters status='owed' → admin_hold
--     rows are already passively excluded
--   - create_payout_batch_atomic filters status='release_ready' →
--     admin_hold rows already excluded
--   - tutor_balances is always kept in sync atomically via RPCs;
--     TypeScript routes never write to tutor_balances directly
--   - No lift_payout_hold path: refunds go admin_hold → reversed
--     directly via apply_refund_side_effects
-- ============================================================

-- ============================================================
-- 1. EXTEND payout_ledger: add admin_hold status + hold columns
-- ============================================================

ALTER TABLE public.payout_ledger
  DROP CONSTRAINT IF EXISTS payout_ledger_status_check;
ALTER TABLE public.payout_ledger
  ADD CONSTRAINT payout_ledger_status_check
  CHECK (status IN ('owed','release_ready','released','reversed','admin_hold'));

ALTER TABLE public.payout_ledger
  ADD COLUMN IF NOT EXISTS hold_reason text
    CHECK (hold_reason IN (
      'student_reported_tutor_no_show','refund_requested','chargeback',
      'session_cancelled','tutor_cancelled','class_access_issue',
      'subscription_dispute','manual_admin_hold','system_inconsistency'
    )),
  ADD COLUMN IF NOT EXISTS case_id    uuid,  -- FK added after payout_cases exists
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;


-- ============================================================
-- 2. CREATE payout_cases
-- ============================================================
-- payout_ledger_id is NULLABLE: a case can be opened before the
-- payout ledger row exists (student files claim before the charge
-- cron fires). fn_create_earning_on_charge (updated below) links
-- them when the ledger row is eventually created.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payout_cases (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_ledger_id        uuid REFERENCES public.payout_ledger(id),
  session_id              uuid REFERENCES public.sessions(id)              ON DELETE SET NULL,
  booking_id              uuid REFERENCES public.bookings(id)              ON DELETE SET NULL,
  subscription_payment_id uuid REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  noshow_claim_id         uuid REFERENCES public.noshow_claims(id)         ON DELETE SET NULL,
  payment_id              uuid REFERENCES public.payments(id)              ON DELETE SET NULL,
  claimant_id             uuid REFERENCES public.profiles(id)              ON DELETE SET NULL,
  tutor_id                uuid NOT NULL REFERENCES public.profiles(id),
  hold_reason             text NOT NULL
    CHECK (hold_reason IN (
      'student_reported_tutor_no_show','refund_requested','chargeback',
      'session_cancelled','tutor_cancelled','class_access_issue',
      'subscription_dispute','manual_admin_hold','system_inconsistency'
    )),
  status                  text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open','under_review','resolved_release_to_tutor',
      'resolved_refund_student','resolved_partial_refund','dismissed','closed'
    )),
  refund_amount_ttd       numeric(12,2),
  release_amount_ttd      numeric(12,2),
  admin_id                uuid REFERENCES public.profiles(id),
  admin_notes             text,
  resolved_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Back-reference FK now that payout_cases exists
ALTER TABLE public.payout_ledger
  ADD CONSTRAINT payout_ledger_case_id_fk
  FOREIGN KEY (case_id) REFERENCES public.payout_cases(id) ON DELETE SET NULL;

-- ============================================================
-- 3. RLS + GRANTS for payout_cases
-- ============================================================

ALTER TABLE public.payout_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_payout_cases"
  ON public.payout_cases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tutor_read_own_payout_cases"
  ON public.payout_cases FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

GRANT ALL ON public.payout_cases TO service_role;

-- ============================================================
-- 4. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS payout_cases_ledger_id_idx
  ON public.payout_cases (payout_ledger_id);
CREATE INDEX IF NOT EXISTS payout_cases_session_id_idx
  ON public.payout_cases (session_id);
CREATE INDEX IF NOT EXISTS payout_cases_sub_payment_id_idx
  ON public.payout_cases (subscription_payment_id);
CREATE INDEX IF NOT EXISTS payout_cases_status_created_idx
  ON public.payout_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payout_cases_tutor_id_idx
  ON public.payout_cases (tutor_id);
CREATE INDEX IF NOT EXISTS payout_ledger_admin_hold_idx
  ON public.payout_ledger (tutor_id, status) WHERE status = 'admin_hold';

-- Uniqueness guards: at most one open case per ledger row
CREATE UNIQUE INDEX IF NOT EXISTS payout_cases_one_open_per_ledger
  ON public.payout_cases (payout_ledger_id)
  WHERE payout_ledger_id IS NOT NULL AND status IN ('open','under_review');

-- At most one pre-ledger open case per session
CREATE UNIQUE INDEX IF NOT EXISTS payout_cases_one_open_preledger_session
  ON public.payout_cases (session_id)
  WHERE payout_ledger_id IS NULL AND session_id IS NOT NULL
    AND status IN ('open','under_review');

-- At most one pre-ledger open case per subscription_payment
CREATE UNIQUE INDEX IF NOT EXISTS payout_cases_one_open_preledger_subscription
  ON public.payout_cases (subscription_payment_id)
  WHERE payout_ledger_id IS NULL AND subscription_payment_id IS NOT NULL
    AND status IN ('open','under_review');


-- ============================================================
-- 5. RPC: place_payout_hold
-- ============================================================
-- Atomically transitions a ledger row (owed|release_ready) →
-- admin_hold, decrements the appropriate tutor_balances bucket,
-- and opens a payout_case. Idempotent if already admin_hold.
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_payout_hold(
  p_ledger_id       uuid,
  p_hold_reason     text,
  p_noshow_claim_id uuid DEFAULT NULL,
  p_claimant_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger    record;
  v_case_id   uuid;
BEGIN
  SELECT * INTO v_ledger
  FROM payout_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger_not_found: %', p_ledger_id;
  END IF;

  -- Idempotency
  IF v_ledger.status = 'admin_hold' THEN
    SELECT id INTO v_case_id
    FROM payout_cases
    WHERE payout_ledger_id = p_ledger_id
      AND status IN ('open','under_review')
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true, 'already_held', true,
      'case_id', v_case_id, 'ledger_id', p_ledger_id
    );
  END IF;

  IF v_ledger.status NOT IN ('owed','release_ready') THEN
    RAISE EXCEPTION 'ledger_not_holdable: status=%', v_ledger.status;
  END IF;

  -- Create payout_case
  INSERT INTO payout_cases (
    payout_ledger_id, session_id, subscription_payment_id,
    noshow_claim_id, claimant_id, tutor_id, hold_reason, status
  ) VALUES (
    p_ledger_id, v_ledger.session_id, v_ledger.subscription_payment_id,
    p_noshow_claim_id, p_claimant_id, v_ledger.tutor_id, p_hold_reason, 'open'
  )
  RETURNING id INTO v_case_id;

  -- Transition ledger to admin_hold
  UPDATE payout_ledger SET
    status      = 'admin_hold',
    hold_reason = p_hold_reason,
    case_id     = v_case_id,
    blocked_at  = now(),
    updated_at  = now()
  WHERE id = p_ledger_id;

  -- Decrement appropriate balance bucket
  IF v_ledger.status = 'owed' THEN
    UPDATE tutor_balances SET
      pending_ttd  = GREATEST(pending_ttd - v_ledger.amount_ttd, 0),
      last_updated = now()
    WHERE tutor_id = v_ledger.tutor_id;
  ELSIF v_ledger.status = 'release_ready' THEN
    UPDATE tutor_balances SET
      available_ttd = GREATEST(available_ttd - v_ledger.amount_ttd, 0),
      last_updated  = now()
    WHERE tutor_id = v_ledger.tutor_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'already_held', false,
    'case_id',     v_case_id,
    'ledger_id',   p_ledger_id,
    'prev_status', v_ledger.status,
    'tutor_id',    v_ledger.tutor_id,
    'amount_ttd',  v_ledger.amount_ttd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_payout_hold(uuid, text, uuid, uuid) TO service_role;


-- ============================================================
-- 6. RPC: resolve_payout_case
-- ============================================================
-- Three resolution paths (release_to_tutor | refund_student |
-- partial_refund). Supports both ledger-exists and null-ledger
-- cases (where admin resolves before the charge cron fires).
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_payout_case(
  p_case_id            uuid,
  p_action             text,
  p_refund_amount_ttd  numeric DEFAULT NULL,
  p_release_amount_ttd numeric DEFAULT NULL,
  p_admin_id           uuid    DEFAULT NULL,
  p_admin_notes        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case        record;
  v_ledger      record;
  v_has_ledger  boolean := false;
  v_new_status  text;
  v_now         timestamptz := now();
BEGIN
  SELECT * INTO v_case
  FROM payout_cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found: %', p_case_id;
  END IF;

  IF v_case.status NOT IN ('open','under_review') THEN
    RAISE EXCEPTION 'case_already_resolved: status=%', v_case.status;
  END IF;

  IF p_action NOT IN ('release_to_tutor','refund_student','partial_refund') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  -- Load ledger row if present
  IF v_case.payout_ledger_id IS NOT NULL THEN
    SELECT * INTO v_ledger
    FROM payout_ledger
    WHERE id = v_case.payout_ledger_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ledger_not_found: %', v_case.payout_ledger_id;
    END IF;

    IF v_ledger.status != 'admin_hold' THEN
      RAISE EXCEPTION 'ledger_not_in_admin_hold: status=%', v_ledger.status;
    END IF;

    v_has_ledger := true;
  END IF;

  -- ---------- Ledger-exists paths ----------
  IF v_has_ledger THEN

    IF p_action = 'release_to_tutor' THEN
      UPDATE payout_ledger SET
        status      = 'owed',
        hold_reason = NULL,
        case_id     = NULL,
        blocked_at  = NULL,
        updated_at  = v_now
      WHERE id = v_ledger.id;

      INSERT INTO tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
      VALUES (v_ledger.tutor_id, v_ledger.amount_ttd, 0, v_now)
      ON CONFLICT (tutor_id) DO UPDATE SET
        pending_ttd  = tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
        last_updated = v_now;

      v_new_status := 'resolved_release_to_tutor';

    ELSIF p_action = 'refund_student' THEN
      -- admin_hold → reversed; no balance change (already decremented at hold time)
      UPDATE payout_ledger SET
        status     = 'reversed',
        updated_at = v_now
      WHERE id = v_ledger.id;

      v_new_status := 'resolved_refund_student';

    ELSIF p_action = 'partial_refund' THEN
      IF p_release_amount_ttd IS NULL OR p_release_amount_ttd < 0 THEN
        RAISE EXCEPTION 'invalid_release_amount_ttd: %', p_release_amount_ttd;
      END IF;

      -- admin_hold → owed with reduced amount; restore only release portion to pending
      UPDATE payout_ledger SET
        amount_ttd  = p_release_amount_ttd,
        status      = 'owed',
        hold_reason = NULL,
        case_id     = NULL,
        blocked_at  = NULL,
        updated_at  = v_now
      WHERE id = v_ledger.id;

      IF p_release_amount_ttd > 0 THEN
        INSERT INTO tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
        VALUES (v_ledger.tutor_id, p_release_amount_ttd, 0, v_now)
        ON CONFLICT (tutor_id) DO UPDATE SET
          pending_ttd  = tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
          last_updated = v_now;
      END IF;

      v_new_status := 'resolved_partial_refund';
    END IF;

  -- ---------- Null-ledger paths ----------
  ELSE

    IF p_action = 'release_to_tutor' THEN
      -- Dismiss: future fn_create_earning_on_charge / activate_subscription
      -- will create the ledger in the normal 'owed' state.
      UPDATE payout_cases SET
        status      = 'dismissed',
        admin_id    = p_admin_id,
        admin_notes = p_admin_notes,
        resolved_at = v_now,
        updated_at  = v_now
      WHERE id = p_case_id;

      RETURN jsonb_build_object(
        'ok', true, 'action', 'dismissed',
        'case_id', p_case_id, 'no_ledger', true
      );

    ELSIF p_action = 'refund_student' THEN
      -- The "block post-refund ledger" guard in fn_create_earning_on_charge
      -- and activate_subscription checks for 'resolved_refund_student' cases
      -- and will not create an owed ledger row.
      UPDATE payout_cases SET
        status      = 'resolved_refund_student',
        admin_id    = p_admin_id,
        admin_notes = p_admin_notes,
        resolved_at = v_now,
        updated_at  = v_now
      WHERE id = p_case_id;

      RETURN jsonb_build_object(
        'ok', true, 'action', 'resolved_refund_student',
        'case_id', p_case_id, 'no_ledger', true
      );

    ELSIF p_action = 'partial_refund' THEN
      RAISE EXCEPTION 'partial_refund_requires_ledger';
    END IF;
  END IF;

  -- Update case for ledger-exists paths
  UPDATE payout_cases SET
    status             = v_new_status,
    refund_amount_ttd  = p_refund_amount_ttd,
    release_amount_ttd = p_release_amount_ttd,
    admin_id           = p_admin_id,
    admin_notes        = p_admin_notes,
    resolved_at        = v_now,
    updated_at         = v_now
  WHERE id = p_case_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'action',    p_action,
    'case_id',   p_case_id,
    'ledger_id', v_case.payout_ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_payout_case(uuid, text, numeric, numeric, uuid, text) TO service_role;


-- ============================================================
-- 7. UPDATE apply_refund_side_effects: handle admin_hold
-- ============================================================
-- Extends the existing RPC so that a payout_ledger row in
-- admin_hold can be reversed directly without re-touching
-- tutor_balances (the amount was already decremented at hold time).
-- ============================================================

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

  -- 1. Lock + load payment
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

  -- 2. Update payment row
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

  -- 3. Resolve session via booking (if any)
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
    RETURN jsonb_build_object(
      'new_payment_status', v_new_status,
      'total_refunded_ttd', v_total_refunded,
      'ledger_action',      'no_session'
    );
  END IF;

  -- 4. Lock + inspect ledger row
  SELECT * INTO v_ledger
  FROM public.payout_ledger
  WHERE session_id = v_session_id
  FOR UPDATE;
  IF FOUND THEN
    v_ledger_id := v_ledger.id;
  END IF;

  IF v_ledger_id IS NOT NULL THEN
    -- Defense in depth: only block on release_ready/released.
    -- admin_hold is explicitly allowed: balance was already decremented at hold time.
    IF v_ledger.status IN ('release_ready', 'released') THEN
      RAISE EXCEPTION 'ledger_already_advanced: session % ledger status %',
        v_session_id, v_ledger.status;
    END IF;

    IF v_retained_amount > 0 THEN
      -- Partial retention
      UPDATE public.payout_ledger
      SET amount_ttd = v_retained_payout,
          status     = 'owed',
          updated_at = now()
      WHERE id = v_ledger_id;

      -- For admin_hold and reversed, the old delta to subtract is 0
      -- (hold: balance already decremented; reversed: was already 0)
      v_old_pending_delta := CASE
        WHEN v_ledger.status IN ('reversed', 'admin_hold') THEN 0
        ELSE COALESCE(v_ledger.amount_ttd, 0)
      END;
      v_new_pending_delta := v_retained_payout;
      v_ledger_action := 'replaced';
    ELSE
      -- Full refund: reverse the row
      UPDATE public.payout_ledger
      SET status     = 'reversed',
          updated_at = now()
      WHERE id = v_ledger_id;

      -- For admin_hold: balance was already decremented at hold time, no further adjustment
      v_old_pending_delta := CASE
        WHEN v_ledger.status IN ('reversed', 'admin_hold') THEN 0
        ELSE COALESCE(v_ledger.amount_ttd, 0)
      END;
      v_new_pending_delta := 0;
      v_ledger_action := 'reverted';
    END IF;

    -- 5. Apply tutor_balances delta
    UPDATE public.tutor_balances
    SET pending_ttd  = GREATEST(pending_ttd - v_old_pending_delta + v_new_pending_delta, 0),
        last_updated = now()
    WHERE tutor_id = v_tutor_id;

    IF NOT FOUND AND v_new_pending_delta > 0 THEN
      INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
      VALUES (v_tutor_id, v_new_pending_delta, 0, now());
    END IF;

  ELSE
    -- No ledger row yet (cron hasn't fired charged_at)
    IF v_retained_amount > 0 THEN
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

  -- 6. Optional session status override
  IF v_session_status IS NOT NULL THEN
    UPDATE public.sessions
    SET status       = v_session_status,
        cancelled_at = CASE
          WHEN v_session_status IN ('CANCELLED', 'NO_SHOW_TUTOR', 'MUTUAL_NON_COMPLETION')
            THEN COALESCE(cancelled_at, now())
          ELSE cancelled_at
        END,
        updated_at   = now()
    WHERE id = v_session_id;
  ELSIF v_ledger_id IS NULL AND v_retained_amount = 0 THEN
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


-- ============================================================
-- 8. UPDATE fn_create_earning_on_charge
-- ============================================================
-- When sessions.charged_at transitions NULL → value:
--   Priority 1: existing open payout_case (null ledger_id) →
--               create ledger in admin_hold and link both rows.
--   Block:      session already refunded or decided against tutor →
--               do not create any ledger (prevents post-resolution
--               payouts when admin resolves BEFORE the cron fires).
--   Priority 2: open noshow_claim with no case yet →
--               create ledger in admin_hold + new case.
--   Normal:     no holds → create owed ledger, increment pending_ttd.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_earning_on_charge()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_id    uuid;
  v_existing_case record;
  v_open_claim    record;
  v_ledger_id     uuid;
  v_case_id       uuid;
BEGIN
  IF NEW.charged_at IS NOT NULL AND OLD.charged_at IS NULL THEN

    -- Look up the payment_id for tutor_earnings row
    SELECT id INTO v_payment_id
    FROM payments
    WHERE booking_id = NEW.booking_id
      AND status = 'succeeded'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_payment_id IS NULL THEN
      RAISE WARNING '[fn_create_earning_on_charge] No succeeded payment for booking_id=%, session_id=%. Skipping.',
        NEW.booking_id, NEW.id;
      RETURN NEW;
    END IF;

    IF COALESCE(NEW.charge_amount_ttd, 0) <= 0
       OR COALESCE(NEW.payout_amount_ttd, 0) <= 0 THEN
      RAISE WARNING '[fn_create_earning_on_charge] Invalid amounts for session_id=%: charge=%, payout=%. Skipping.',
        NEW.id, NEW.charge_amount_ttd, NEW.payout_amount_ttd;
      RETURN NEW;
    END IF;

    -- tutor_earnings row (unchanged from original migration 163)
    INSERT INTO tutor_earnings (
      id, tutor_id, session_id, payment_id,
      gross_amount_ttd, tutor_share_ttd, commission_ttd, status
    ) VALUES (
      gen_random_uuid(),
      NEW.tutor_id, NEW.id, v_payment_id,
      NEW.charge_amount_ttd, NEW.payout_amount_ttd,
      COALESCE(NEW.platform_fee_ttd, 0), 'EARNED'
    )
    ON CONFLICT (payment_id) DO NOTHING;

    -- ---- Check for existing open payout_case (pre-ledger hold) ----
    SELECT id, hold_reason INTO v_existing_case
    FROM payout_cases
    WHERE session_id = NEW.id
      AND payout_ledger_id IS NULL
      AND status IN ('open','under_review')
    LIMIT 1;

    -- ---- Block: session already refunded or decided against tutor ----
    -- Covers the race where admin resolves before charge cron fires.
    IF EXISTS (
      SELECT 1 FROM noshow_claims
      WHERE session_id = NEW.id
        AND admin_verdict IN ('tutor_noshow','tie')
    ) OR EXISTS (
      SELECT 1 FROM payments
      WHERE booking_id = NEW.booking_id
        AND status IN ('refunded','partially_refunded')
    ) OR EXISTS (
      SELECT 1 FROM payout_cases
      WHERE session_id = NEW.id
        AND status = 'resolved_refund_student'
    ) THEN
      RETURN NEW;  -- do not create any payout_ledger row
    END IF;

    IF v_existing_case.id IS NOT NULL THEN
      -- Hold path: link to existing case
      INSERT INTO payout_ledger (
        id, session_id, tutor_id, amount_ttd, status, hold_reason, blocked_at
      ) VALUES (
        gen_random_uuid(),
        NEW.id, NEW.tutor_id, NEW.payout_amount_ttd,
        'admin_hold', v_existing_case.hold_reason, now()
      )
      ON CONFLICT (session_id) DO NOTHING
      RETURNING id INTO v_ledger_id;

      IF v_ledger_id IS NOT NULL THEN
        UPDATE payout_cases
          SET payout_ledger_id = v_ledger_id, updated_at = now()
          WHERE id = v_existing_case.id;

        UPDATE payout_ledger
          SET case_id = v_existing_case.id
          WHERE id = v_ledger_id;
      END IF;

    ELSE
      -- Check for open noshow_claim (fallback: no pre-ledger case yet)
      SELECT id, claimant_id INTO v_open_claim
      FROM noshow_claims
      WHERE session_id = NEW.id
        AND status IN ('awaiting_response','pending_admin')
      LIMIT 1;

      IF v_open_claim.id IS NOT NULL THEN
        -- Hold path: create ledger + new case
        INSERT INTO payout_ledger (
          id, session_id, tutor_id, amount_ttd, status, hold_reason, blocked_at
        ) VALUES (
          gen_random_uuid(),
          NEW.id, NEW.tutor_id, NEW.payout_amount_ttd,
          'admin_hold', 'student_reported_tutor_no_show', now()
        )
        ON CONFLICT (session_id) DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NOT NULL THEN
          INSERT INTO payout_cases (
            payout_ledger_id, session_id, noshow_claim_id,
            claimant_id, tutor_id, hold_reason, status
          ) VALUES (
            v_ledger_id, NEW.id, v_open_claim.id,
            v_open_claim.claimant_id, NEW.tutor_id,
            'student_reported_tutor_no_show', 'open'
          )
          RETURNING id INTO v_case_id;

          UPDATE payout_ledger SET case_id = v_case_id WHERE id = v_ledger_id;
        END IF;

      ELSE
        -- Normal path: no hold
        INSERT INTO payout_ledger (
          id, session_id, tutor_id, amount_ttd, status
        ) VALUES (
          gen_random_uuid(),
          NEW.id, NEW.tutor_id, NEW.payout_amount_ttd, 'owed'
        )
        ON CONFLICT (session_id) DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NOT NULL THEN
          INSERT INTO tutor_balances (
            tutor_id, pending_ttd, available_ttd, last_updated
          ) VALUES (
            NEW.tutor_id, NEW.payout_amount_ttd, 0, now()
          )
          ON CONFLICT (tutor_id) DO UPDATE SET
            pending_ttd  = tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
            last_updated = now();
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_create_earning_on_charge ON sessions;
CREATE TRIGGER trg_create_earning_on_charge
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_earning_on_charge();


-- ============================================================
-- 9. UPDATE activate_subscription: check for pre-ledger holds
-- ============================================================
-- Same pattern as fn_create_earning_on_charge for subscription
-- payout_ledger rows. If an open pre-ledger payout_case exists
-- for the subscription_payment_id, create the ledger in
-- admin_hold and link it; otherwise normal owed creation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_subscription(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sp_id        uuid := (p_payload->>'subscription_payment_id')::uuid;
  v_period_start timestamptz := (p_payload->>'period_start')::timestamptz;
  v_period_end   timestamptz := (p_payload->>'period_end')::timestamptz;
  v_amount       numeric := (p_payload->>'amount_ttd')::numeric;
  v_platform_fee numeric := (p_payload->>'platform_fee_ttd')::numeric;
  v_payout       numeric := (p_payload->>'tutor_payout_ttd')::numeric;
  v_grace_days   int;
  v_sp           record;
  v_sub_case     record;
  v_ledger_id    uuid;
BEGIN
  SELECT sp.*, g.grace_period_days, g.tutor_id
  INTO v_sp
  FROM public.subscription_payments sp
  JOIN public.group_enrollments ge ON ge.id = sp.enrollment_id
  JOIN public.groups g ON g.id = ge.group_id
  WHERE sp.id = v_sp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscription_payment_not_found');
  END IF;

  IF v_sp.status = 'PAID' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'enrollment_id', v_sp.enrollment_id);
  END IF;

  v_grace_days := COALESCE(v_sp.grace_period_days, 7);

  UPDATE public.subscription_payments SET
    status            = 'PAID',
    amount_ttd        = COALESCE(v_amount, amount_ttd),
    platform_fee_ttd  = COALESCE(v_platform_fee, platform_fee_ttd),
    tutor_payout_ttd  = COALESCE(v_payout, tutor_payout_ttd),
    period_start      = v_period_start,
    period_end        = v_period_end,
    activation_status = 'succeeded',
    paid_at           = now()
  WHERE id = v_sp_id;

  UPDATE public.group_enrollments SET
    status                        = 'ACTIVE',
    payment_status                = 'PAID',
    current_period_start          = v_period_start,
    current_period_end            = v_period_end,
    next_payment_due_at           = v_period_end,
    grace_period_ends_at          = v_period_end + (v_grace_days * INTERVAL '1 day'),
    grace_period_days_snapshot    = v_grace_days,
    last_paid_at                  = now(),
    activated_subscription_payment_id = v_sp_id,
    pending_payment_expires_at    = NULL,
    reminder_count                = 0,
    last_reminder_sent_at         = NULL,
    expires_at                    = v_period_end
  WHERE id = v_sp.enrollment_id;

  -- Create payout_ledger row if payout > 0
  IF COALESCE(v_payout, 0) > 0 THEN

    -- Check for an open pre-ledger payout_case for this subscription_payment
    SELECT id, hold_reason INTO v_sub_case
    FROM payout_cases
    WHERE subscription_payment_id = v_sp_id
      AND payout_ledger_id IS NULL
      AND status IN ('open','under_review')
    LIMIT 1;

    -- Block if admin already resolved a refund for this payment before activation
    IF EXISTS (
      SELECT 1 FROM payout_cases
      WHERE subscription_payment_id = v_sp_id
        AND status = 'resolved_refund_student'
    ) THEN
      -- Payout already decided against tutor; skip ledger creation
      NULL;

    ELSIF v_sub_case.id IS NOT NULL THEN
      -- Hold path: create ledger in admin_hold and link to existing case
      INSERT INTO public.payout_ledger (
        subscription_payment_id, tutor_id, amount_ttd,
        status, hold_reason, blocked_at
      ) VALUES (
        v_sp_id, v_sp.tutor_id, v_payout,
        'admin_hold', v_sub_case.hold_reason, now()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_ledger_id;

      IF v_ledger_id IS NOT NULL THEN
        UPDATE payout_cases
          SET payout_ledger_id = v_ledger_id, updated_at = now()
          WHERE id = v_sub_case.id;

        UPDATE payout_ledger
          SET case_id = v_sub_case.id
          WHERE id = v_ledger_id;
      END IF;
      -- Do NOT touch tutor_balances for held row

    ELSE
      -- Normal path
      INSERT INTO public.payout_ledger (
        subscription_payment_id, tutor_id, amount_ttd, status
      ) VALUES (
        v_sp_id, v_sp.tutor_id, v_payout, 'owed'
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_ledger_id;

      IF v_ledger_id IS NOT NULL THEN
        INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd)
        VALUES (v_sp.tutor_id, v_payout, 0)
        ON CONFLICT (tutor_id) DO UPDATE
        SET pending_ttd  = public.tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
            last_updated = now();
      END IF;
    END IF;

  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'enrollment_id', v_sp.enrollment_id,
    'status',        'ACTIVE',
    'period_start',  v_period_start,
    'period_end',    v_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_subscription(jsonb) TO service_role;


-- ============================================================
-- 10. EXTEND notifications type CHECK
-- ============================================================
-- Rebuilds the comprehensive list including all types currently
-- used in the application plus the new payout hold types.
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- bookings
    'booking_request',
    'booking_request_received',
    'booking_accepted',
    'booking_confirmed',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    -- messaging
    'new_message',
    'new_stream_post',
    -- classes / groups
    'class_invite',
    'new_class_member',
    'group_session_updated',
    'group_removal',
    'group_removal_payment_action',
    'with_cause_removal_submitted_for_review',
    'with_cause_removal_admin_decision',
    -- sessions
    'SESSION_REMINDER',
    'session_rescheduled',
    'tutor_cancelled_session',
    'tutor_added_session',
    'attendance_alert',
    'rsvp_received',
    -- payments
    'payment_succeeded',
    'payment_failed',
    'payment_refunded',
    'funds_released',
    -- subscriptions
    'subscription_payment_succeeded',
    'subscription_activation_delayed',
    'subscription_refund_issued',
    'subscription_payment_reminder',
    'subscription_grace_started',
    'subscription_suspended',
    'subscription_cancellation_scheduled',
    'subscription_cancellation_finalized',
    'subscription_reactivation',
    -- waitlist
    'waitlist_offer_available',
    'waitlist_offer_expired',
    -- noshow / disputes
    'noshow_claim_filed',
    'noshow_claim_response',
    'noshow_claim_escalated',
    -- payout holds (new)
    'payout_held',
    'payout_released',
    -- admin / moderation
    'reliability_warning_issued',
    'rating_appeal_decided',
    'strike_appeal_decided',
    'new_feedback',
    'refund_failed_admin_alert',
    -- enrollment
    'ENROLLMENT_CONFIRMED',
    'NEW_ANNOUNCEMENT',
    'SESSION_CANCELLED',
    'NEW_REVIEW',
    'WAITLIST_AVAILABLE'
  ))
  NOT VALID;


-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  ASSERT to_regclass('public.payout_cases') IS NOT NULL,
    'payout_cases table missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'payout_ledger'
      AND column_name IN ('hold_reason','case_id','blocked_at')
  ) = 3, 'payout_ledger hold columns missing';

  ASSERT (
    SELECT COUNT(*) FROM pg_proc
    WHERE proname IN ('place_payout_hold','resolve_payout_case')
  ) = 2, 'One or more new RPCs missing';

  RAISE NOTICE 'Migration 168 verified successfully.';
END $$;
