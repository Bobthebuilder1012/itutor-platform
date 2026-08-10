-- ============================================================
-- MIGRATION 206: SECURE-SPOT CLAIM + CONFIRM
-- iTutor Database
-- ============================================================
--
-- Two RPCs, modelled on activate_subscription (migration 160): a jsonb
-- payload, money amounts computed in TypeScript by the shared
-- commission calculator and passed in, idempotent on replay.
--
--   secure_spot_claim(payload)   — capacity check + enrolment insert in
--                                  ONE transaction, before Stripe
--   secure_spot_confirm(payload) — webhook: re-check capacity, mark
--                                  paid, hold the money
--
-- WHY A LOCK. Two students clicking "secure your spot" on the last seat
-- both read the same count and both insert. The groups row is taken
-- FOR UPDATE so claims on a class serialise; counting after the lock is
-- then honest. A partial unique index cannot express "at most N rows
-- per group", so the lock is the mechanism.
--
-- CAPACITY AND UNPAID CHECKOUTS — deviation from spec, deliberate.
-- The handover says SECURED_PENDING_PAYMENT must not count toward
-- capacity. process_waitlist_offer (migration 160) already established
-- the better rule for the identical problem: an unpaid checkout counts
-- WHILE ITS WINDOW IS OPEN and stops counting once it expires. That
-- holds the seat for the student who is typing their card in, and
-- returns it automatically when they wander off — no cron needed. It
-- also makes the two-payers-one-seat race rare instead of routine.
-- The webhook re-check below stays as the backstop, because rare is
-- not never.
--
-- FREE CLASSES take the same path with amount 0: no subscription
-- payment row, no ledger row, no release date. There is no money to
-- hold, and Stripe will not create zero-value objects.
-- ============================================================

BEGIN;

-- ============================================================
-- Shared capacity counter
-- ============================================================
-- Counts seats that are genuinely spoken for. Excludes the enrolment
-- being confirmed (p_exclude_enrollment) so the webhook re-check does
-- not count the payer against their own seat.

CREATE OR REPLACE FUNCTION public.secure_spot_seats_used(
  p_group_id            uuid,
  p_exclude_enrollment  uuid DEFAULT NULL
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.group_enrollments
  WHERE group_id = p_group_id
    AND (p_exclude_enrollment IS NULL OR id <> p_exclude_enrollment)
    AND (
      status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
      OR (
        status IN ('PENDING_PAYMENT', 'SECURED_PENDING_PAYMENT')
        AND pending_payment_expires_at > now()
      )
    );
$$;

COMMENT ON FUNCTION public.secure_spot_seats_used(uuid, uuid) IS
  'Seats consumed in a class: paid seats, plus checkouts whose payment '
  'window is still open. Expired checkouts release their seat implicitly.';

GRANT EXECUTE ON FUNCTION public.secure_spot_seats_used(uuid, uuid) TO service_role;


-- ============================================================
-- claim — runs before Stripe
-- ============================================================
-- payload: group_id, student_id, amount_ttd, platform_fee_ttd,
--          tutor_payout_ttd, hold_minutes (optional, default 30)

CREATE OR REPLACE FUNCTION public.secure_spot_claim(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id     uuid    := (p_payload->>'group_id')::uuid;
  v_student_id   uuid    := (p_payload->>'student_id')::uuid;
  v_amount       numeric := COALESCE((p_payload->>'amount_ttd')::numeric, 0);
  v_platform_fee numeric := COALESCE((p_payload->>'platform_fee_ttd')::numeric, 0);
  v_payout       numeric := COALESCE((p_payload->>'tutor_payout_ttd')::numeric, 0);
  v_hold_minutes int     := COALESCE((p_payload->>'hold_minutes')::int, 30);
  v_group        record;
  v_expires      timestamptz;
  v_enrollment   uuid;
  v_sp_id        uuid;
BEGIN
  IF v_group_id IS NULL OR v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  END IF;

  -- Serialises concurrent claims on this class.
  SELECT id, tutor_id, max_students, secure_spot_enabled, archived_at
  INTO v_group
  FROM public.groups
  WHERE id = v_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_not_found');
  END IF;

  IF v_group.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_archived');
  END IF;

  IF NOT COALESCE(v_group.secure_spot_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'secure_spot_not_enabled');
  END IF;

  -- A tutor securing a seat in their own class is always a mistake.
  IF v_group.tutor_id = v_student_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tutor_cannot_enrol');
  END IF;

  -- Already in the class, or already holding an open checkout for it.
  IF EXISTS (
    SELECT 1 FROM public.group_enrollments
    WHERE group_id = v_group_id
      AND student_id = v_student_id
      AND (
        status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
        OR (status IN ('PENDING_PAYMENT', 'SECURED_PENDING_PAYMENT')
            AND pending_payment_expires_at > now())
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_enrolled');
  END IF;

  IF public.secure_spot_seats_used(v_group_id) >= COALESCE(v_group.max_students, 20) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_capacity');
  END IF;

  v_expires := now() + (v_hold_minutes || ' minutes')::interval;

  INSERT INTO public.group_enrollments (
    student_id, group_id, enrollment_type, status, payment_status,
    plan_price_ttd, pending_payment_expires_at, billing_provider, enrolled_at
  ) VALUES (
    v_student_id, v_group_id, 'SUBSCRIPTION', 'SECURED_PENDING_PAYMENT',
    CASE WHEN v_amount > 0 THEN 'PENDING' ELSE 'FREE' END,
    v_amount, v_expires,
    -- 'stripe' keeps the legacy process-subscriptions cron off this row.
    'stripe', now()
  )
  RETURNING id INTO v_enrollment;

  -- Free class: no money, so no payment row and nothing to hold.
  IF v_amount > 0 THEN
    INSERT INTO public.subscription_payments (
      enrollment_id, group_id, student_id, type, amount_ttd,
      platform_fee_ttd, tutor_payout_ttd, status, checkout_expires_at
    ) VALUES (
      v_enrollment, v_group_id, v_student_id, 'secure_spot', v_amount,
      v_platform_fee, v_payout, 'PENDING', v_expires
    )
    RETURNING id INTO v_sp_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', v_enrollment,
    'subscription_payment_id', v_sp_id,
    'expires_at', v_expires,
    'seats_used', public.secure_spot_seats_used(v_group_id),
    'max_students', COALESCE(v_group.max_students, 20)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.secure_spot_claim(jsonb) TO service_role;


-- ============================================================
-- confirm — runs from the Stripe webhook
-- ============================================================
-- payload: enrollment_id, payment_intent_id, release_date,
--          period_start, period_end
--
-- The webhook is the only writer of payment state. Returns
-- ok:false / oversubscribed when the class filled while this student
-- was paying; the caller then refunds through Stripe and emails them.
-- It does NOT refund here — money movement belongs in the route that
-- can talk to Stripe, not in a database function.

CREATE OR REPLACE FUNCTION public.secure_spot_confirm(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment_id uuid := (p_payload->>'enrollment_id')::uuid;
  v_pi_id         text := p_payload->>'payment_intent_id';
  v_release_date  date := NULLIF(p_payload->>'release_date', '')::date;
  v_period_start  timestamptz := NULLIF(p_payload->>'period_start', '')::timestamptz;
  v_period_end    timestamptz := NULLIF(p_payload->>'period_end', '')::timestamptz;
  v_enr           record;
  v_group         record;
  v_sp            record;
BEGIN
  SELECT * INTO v_enr
  FROM public.group_enrollments
  WHERE id = v_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'enrollment_not_found');
  END IF;

  -- Stripe redelivers. A second delivery must not create a second seat,
  -- a second payment row or a second ledger line.
  IF v_enr.status = 'SECURED' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'enrollment_id', v_enrollment_id);
  END IF;

  IF v_enr.status <> 'SECURED_PENDING_PAYMENT' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unexpected_status',
                              'status', v_enr.status);
  END IF;

  SELECT id, tutor_id, max_students INTO v_group
  FROM public.groups WHERE id = v_enr.group_id
  FOR UPDATE;

  -- The race backstop: both students passed the claim check and both
  -- paid. Whoever's webhook lands second is refunded by the caller.
  IF public.secure_spot_seats_used(v_enr.group_id, v_enrollment_id)
       >= COALESCE(v_group.max_students, 20) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oversubscribed',
                              'enrollment_id', v_enrollment_id);
  END IF;

  SELECT * INTO v_sp
  FROM public.subscription_payments
  WHERE enrollment_id = v_enrollment_id AND type = 'secure_spot'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  UPDATE public.group_enrollments SET
    status                     = 'SECURED',
    payment_status             = CASE WHEN v_sp.id IS NULL THEN 'FREE' ELSE 'PAID' END,
    secured_at                 = now(),
    secure_payment_intent_id   = v_pi_id,
    release_date               = v_release_date,
    current_period_start       = v_period_start,
    current_period_end         = v_period_end,
    pending_payment_expires_at = NULL
  WHERE id = v_enrollment_id;

  IF v_sp.id IS NOT NULL THEN
    UPDATE public.subscription_payments SET
      status                   = 'PAID',
      paid_at                  = now(),
      activation_status        = 'succeeded',
      stripe_payment_intent_id = v_pi_id,
      period_start             = v_period_start,
      period_end               = v_period_end
    WHERE id = v_sp.id;

    -- Held money. 'owed' IS the hold: the CSV export only takes
    -- 'release_ready', and flip_owed_to_release_ready (migration 205)
    -- refuses to promote a SECURED enrolment before its release_date.
    IF COALESCE(v_sp.tutor_payout_ttd, 0) > 0 THEN
      INSERT INTO public.payout_ledger (subscription_payment_id, tutor_id, amount_ttd, status)
      VALUES (v_sp.id, v_group.tutor_id, v_sp.tutor_payout_ttd, 'owed')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd)
      VALUES (v_group.tutor_id, v_sp.tutor_payout_ttd, 0)
      ON CONFLICT (tutor_id) DO UPDATE
      SET pending_ttd  = public.tutor_balances.pending_ttd + EXCLUDED.pending_ttd,
          last_updated = now();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', v_enrollment_id,
    'subscription_payment_id', v_sp.id,
    'release_date', v_release_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.secure_spot_confirm(jsonb) TO service_role;

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- Race: run two claims concurrently against a class with one seat.
-- The second must return no_capacity, and the class must end up with
-- exactly one SECURED_PENDING_PAYMENT row.
--
-- Expiry: set pending_payment_expires_at into the past and re-run
-- secure_spot_seats_used — the seat must come back.
