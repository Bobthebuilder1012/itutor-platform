-- =====================================================
-- MIGRATION 227: SUBSCRIPTION PAUSE / RESUME / CANCEL (§10.7)
-- =====================================================
-- §10.7 asks for these columns "on subscriptions". There is no `subscriptions`
-- table in this schema: a group subscription IS the group_enrollments row, which
-- already carries stripe_subscription_id, billing_provider, cancel_at_period_end
-- and cancelled_at. So the columns go there rather than on a new table nothing
-- else would reference.
--
-- STATUS IS DELIBERATELY NOT CHANGED WHEN PAUSED
-- No 'PAUSED' status is added, and the enrolment stays ACTIVE. The design is
-- explicit that "pausing keeps the child's place and the same tutor, and stops
-- all charges until you resume" — a paused family is still enrolled, and the
-- seat is still theirs. Introducing a PAUSED status would make every existing
-- reader of `status` (rosters, capacity counts, access checks) silently treat
-- them as not-enrolled, which would take away the very thing pausing is meant to
-- preserve. paused_at is the billing flag; status remains the enrolment flag.
--
-- WHAT THIS MIGRATION DOES NOT BUILD, AND WHY
-- pause_reason carries both values §10.7 names, but ONLY 'payer_request' is
-- wired. 'tutor_break' is left as an unused enum member on purpose:
--
--   * §12.4 lists tutor-initiated pause as an OPEN question — whether it halts
--     billing for every enrolled family at once, what happens to seats, and who
--     can trigger it are all undecided, and the tutor-break pause email is
--     blocked on the same question.
--   * A separate scoped spec for it (teacher_breaks table, per-group and
--     "Pause All" entry points, scheduled start/end with a cron auto-resume) was
--     explicitly deferred by the product owner pending a go-ahead.
--
-- Building it from either source alone would guess at answers that affect other
-- families' billing. The column is present so that work has somewhere to land
-- without a second migration.
-- =====================================================

BEGIN;

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS paused_at           timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_reason        text
    CHECK (pause_reason IS NULL OR pause_reason IN ('tutor_break', 'payer_request')),
  -- When billing is due to restart. Null means "until manually resumed", which
  -- is the only shape the payer-initiated flow uses — a parent pausing for an
  -- unknown length of time should not be forced to invent an end date.
  ADD COLUMN IF NOT EXISTS resume_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.group_enrollments.paused_at IS
  '§10.7. Billing paused; the enrolment stays ACTIVE and the place is kept. Stripe side uses pause_collection behavior=void.';
COMMENT ON COLUMN public.group_enrollments.pause_reason IS
  'payer_request is wired. tutor_break is reserved: §12.4 is unresolved and the scoped spec for it is deferred.';

-- Charging paths need to find paused rows cheaply, and skipping them is the
-- whole point — a paused family that still gets charged is worse than one that
-- was never allowed to pause.
CREATE INDEX IF NOT EXISTS idx_group_enrollments_paused
  ON public.group_enrollments (paused_at)
  WHERE paused_at IS NOT NULL;

-- ---------------------------------------------------------------
-- Guard: pausing and cancelling go through the server
-- ---------------------------------------------------------------
-- These fields have to move in step with Stripe. A client that wrote paused_at
-- directly would stop the row looking billable to us while Stripe carried on
-- charging the card — the failure mode where a parent believes they paused and
-- the money keeps leaving.
CREATE OR REPLACE FUNCTION public.group_enrollment_pause_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  IF NEW.paused_at    IS DISTINCT FROM OLD.paused_at
  OR NEW.paused_by    IS DISTINCT FROM OLD.paused_by
  OR NEW.pause_reason IS DISTINCT FROM OLD.pause_reason
  OR NEW.resume_at    IS DISTINCT FROM OLD.resume_at THEN
    RAISE EXCEPTION 'subscription pause state is set server-side, alongside the payment provider'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_enrollment_pause_guard ON public.group_enrollments;
CREATE TRIGGER trg_group_enrollment_pause_guard
  BEFORE UPDATE ON public.group_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.group_enrollment_pause_guard();

COMMIT;
