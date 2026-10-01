-- =====================================================================
-- 264_activate_subscription_syncs_plan_price
--
-- activate_subscription() updated every group_enrollments column that
-- describes the current cycle (status, period dates, last_paid_at, ...)
-- except plan_price_ttd — the column every "Active — TT$X/mo" display in
-- the app reads (student subscriptions, tutor class roster, parent
-- billing, tutor wallet projections). That column is otherwise written
-- only once, when the enrollment row is first created
-- (createGroupSubscriptionCheckout), and a retried checkout that reuses
-- an existing PENDING_PAYMENT row can legitimately charge a different
-- amount (the tutor changed the class price, a promotion came or went)
-- without ever updating it — so the UI keeps showing whatever price the
-- very first attempt on that row quoted, even after later cycles pay a
-- different amount.
--
-- This re-points plan_price_ttd at the base amount an initial or
-- reactivation payment actually charged (the same v_amount written to
-- subscription_payments above). Renewals leave it alone — see the CASE.
-- Everything else in the function is unchanged from migration 168.
-- =====================================================================

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
    -- Initial/reactivation rows are staged by checkout with the BASE price.
    -- A renewal row the Stripe webhook creates on the fly stores the invoice's
    -- fee-inclusive total, which would inflate the displayed plan price.
    plan_price_ttd                = CASE
                                      WHEN v_sp.type IN ('subscription_initial', 'subscription_reactivation')
                                      THEN COALESCE(v_amount, plan_price_ttd)
                                      ELSE plan_price_ttd
                                    END,
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
