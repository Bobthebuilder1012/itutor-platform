-- ============================================================
-- MIGRATION 210: A SECURED SPOT GRANTS ACCESS
-- iTutor Database
-- ============================================================
--
-- check_subscription_access only returned has_access for ACTIVE/GRACE, so a
-- student who had paid for their first month up front was locked out of the
-- class they had paid for. Found by testing the lapse path: there was no
-- access to cut.
--
-- SECURED deliberately does NOT test current_period_end. The paid month ends
-- on release_date, but the student keeps access through the grace window while
-- they decide whether to continue, and the secure-spot cron is what ends it by
-- flipping the enrolment to COMPLETED. Gating on the period here would cut
-- access the moment the month ended and silently shorten that window to zero.
--
-- payment_status FREE is accepted alongside PAID: a reservation on a free
-- class is still a reservation.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_subscription_access(p_student_id uuid, p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e record;
BEGIN
  SELECT id, status, payment_status,
         current_period_start, current_period_end,
         next_payment_due_at, grace_period_ends_at,
         plan_price_ttd, cancel_at_period_end,
         pending_payment_expires_at
  INTO v_e
  FROM public.group_enrollments
  WHERE student_id      = p_student_id
    AND group_id        = p_group_id
    AND enrollment_type = 'SUBSCRIPTION'
    AND status NOT IN ('CANCELLED', 'COMPLETED', 'ACTIVATION_FAILED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('subscribed', false, 'has_access', false, 'status', 'none');
  END IF;

  RETURN jsonb_build_object(
    'subscribed',               true,
    'enrollment_id',            v_e.id,
    'status',                   v_e.status,
    'payment_status',           v_e.payment_status,
    'has_access',               (
      (
        v_e.payment_status = 'PAID'
        AND v_e.current_period_start IS NOT NULL
        AND v_e.current_period_end IS NOT NULL
        AND v_e.current_period_end > now()
        AND v_e.status IN ('ACTIVE', 'GRACE')
      )
      OR (
        v_e.status = 'SECURED'
        AND v_e.payment_status IN ('PAID', 'FREE')
      )
    ),
    'current_period_start',     v_e.current_period_start,
    'current_period_end',       v_e.current_period_end,
    'next_payment_due_at',      v_e.next_payment_due_at,
    'grace_period_ends_at',     v_e.grace_period_ends_at,
    'plan_price_ttd',           v_e.plan_price_ttd,
    'cancel_at_period_end',     v_e.cancel_at_period_end,
    'pending_payment_expires_at', v_e.pending_payment_expires_at
  );
END;
$function$;

COMMIT;
