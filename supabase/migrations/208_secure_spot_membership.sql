-- ============================================================
-- MIGRATION 208: A SECURED SPOT IS A MEMBERSHIP
-- iTutor Database
-- ============================================================
--
-- secure_spot_confirm wrote group_enrollments but not group_members. The
-- subscription path has always upserted a member row (see
-- handleSubscriptionPayment, "Ensure group_members row is approved"), and
-- almost everything tutor-facing reads group_members rather than enrolments.
--
-- The effect: a student who had paid was invisible in the tutor's roster —
-- the "Spot secured" badge could never render — and class access, which also
-- keys off membership, would have refused them. Money taken, nothing granted.
--
-- Added to the RPC rather than the calling route so it shares the transaction
-- that flips the enrolment to SECURED. A membership granted separately could
-- fail on its own and leave the same split state.
-- ============================================================

BEGIN;

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

  IF v_enr.status = 'SECURED' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'enrollment_id', v_enrollment_id);
  END IF;

  IF v_enr.status <> 'SECURED_PENDING_PAYMENT' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unexpected_status', 'status', v_enr.status);
  END IF;

  SELECT id, tutor_id, max_students INTO v_group
  FROM public.groups WHERE id = v_enr.group_id
  FOR UPDATE;

  IF public.secure_spot_seats_used(v_enr.group_id, v_enrollment_id)
       >= COALESCE(v_group.max_students, 20) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oversubscribed', 'enrollment_id', v_enrollment_id);
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

  -- THE FIX: the student is a member of the class from now, not from the day
  -- the first lesson happens. They have paid; the tutor must be able to see
  -- them, message them and plan around them.
  INSERT INTO public.group_members (group_id, user_id, status)
  VALUES (v_enr.group_id, v_enr.student_id, 'approved')
  ON CONFLICT ON CONSTRAINT group_members_unique
  DO UPDATE SET status = 'approved';

  IF v_sp.id IS NOT NULL THEN
    UPDATE public.subscription_payments SET
      status                   = 'PAID',
      paid_at                  = now(),
      activation_status        = 'succeeded',
      stripe_payment_intent_id = v_pi_id,
      period_start             = v_period_start,
      period_end               = v_period_end
    WHERE id = v_sp.id;

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

-- Backfill: any spot secured before this migration is missing its membership.
INSERT INTO public.group_members (group_id, user_id, status)
SELECT ge.group_id, ge.student_id, 'approved'
FROM public.group_enrollments ge
WHERE ge.status = 'SECURED'
ON CONFLICT ON CONSTRAINT group_members_unique DO UPDATE SET status = 'approved';

COMMIT;
