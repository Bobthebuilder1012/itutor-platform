-- =====================================================
-- MIGRATION 219: PARENT-APPROVAL BOOKING REQUESTS
-- =====================================================
-- Handover §10.1 + §4.
--
-- WHAT ALREADY EXISTED
-- PENDING_PARENT_APPROVAL / PARENT_APPROVED / PARENT_REJECTED are in the
-- bookings status CHECK constraint and in lib/types/booking.ts, and are
-- referenced by no other .ts/.tsx file. The enum is the whole of it: there are
-- zero rows in any of those states, and nothing ever writes one. The root-level
-- PARENT_APPROVAL_WORKFLOW_COMPLETE.sql describes a system that was never
-- wired. This migration is what actually wires it.
--
-- bookings already carries parent_approved_at, parent_rejected_at, parent_notes
-- and payer_id from that earlier attempt. They are left alone and kept in step
-- by the application, so anything still reading them keeps working; the new
-- columns below are the ones the flow is built on.
--
-- THREE EXTRA STATUSES, AND WHY
-- §10.1 only asks for SEAT_UNAVAILABLE_REFUNDED. EXPIRED and WITHDRAWN are
-- added because behaviour elsewhere in the document cannot be expressed without
-- them: §4.2 gives a request an expiry with no email, discoverable only as
-- state, and the parent's Past decisions lists three outcomes -- approved,
-- declined and expired (§9.1). §28 lets a student withdraw. Folding those into
-- the existing CANCELLED would leave the parent unable to tell "this lapsed
-- while I did not answer" from "my child changed their mind", which is exactly
-- the distinction that list exists to draw.
--
-- ON RLS AND WHY THE HARD PART IS A TRIGGER
-- The live student UPDATE policy is
--   "Students can update own bookings"  USING/WITH CHECK (auth.uid() = student_id)
-- with no column and no status restriction. Today a student can set their own
-- booking to CONFIRMED, or edit price_ttd. §10.1 wants "UPDATEs only to
-- withdraw", and a WITH CHECK cannot say that because it never sees OLD.
--
-- The guard has to be surgical. Every existing booking mutation
-- (student_cancel_booking, student_accept_counter, tutor_decline_booking,
-- tutor_counter_offer, tutor_confirm_booking, create_booking_request) is
-- SECURITY DEFINER, which bypasses policies but NOT triggers -- and those
-- functions still run with the caller's JWT, so a blanket "authenticated may
-- not change status" trigger would break cancellation and counter-offers
-- platform-wide. So the trigger restricts only the new columns and only the
-- transitions in and out of PENDING_PARENT_APPROVAL, a state none of those
-- functions ever reads or writes.
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- §10.1 columns
-- ---------------------------------------------------------------
-- Names follow the handover verbatim (frozen_price, not frozen_price_ttd) so
-- that anyone building from that document finds what it says. The rest of the
-- table uses a _ttd suffix; the currency is still TTD.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_at         timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_price         numeric,
  ADD COLUMN IF NOT EXISTS frozen_platform_fee  numeric,
  ADD COLUMN IF NOT EXISTS decline_reason       text,
  ADD COLUMN IF NOT EXISTS decided_at           timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_session_id  text;

COMMENT ON COLUMN public.bookings.frozen_price IS
  'Decision 10: the price as listed when the request was sent. Never recomputed at approval — the tutor may have changed their rate since, and the parent agreed to this figure.';
COMMENT ON COLUMN public.bookings.expires_at IS
  '§4.2: for 1:1, session start minus 2 hours. A parent cannot approve inside that window. Group-class expiry is unresolved (§12) and is left NULL.';
COMMENT ON COLUMN public.bookings.checkout_session_id IS
  'Stripe hosted Checkout session (§4.4). Used to tie checkout.session.completed back to the booking at fulfilment.';

-- ---------------------------------------------------------------
-- Statuses
-- ---------------------------------------------------------------
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK (
  status = ANY (ARRAY[
    'PENDING', 'PENDING_PARENT_APPROVAL', 'PARENT_APPROVED', 'PARENT_REJECTED',
    'COUNTER_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW',
    -- new
    'SEAT_UNAVAILABLE_REFUNDED',  -- §4.5 second capacity check lost the race, money already taken and refunded
    'EXPIRED',                    -- §4.2 closed unanswered, no email sent
    'WITHDRAWN'                   -- §28 the student pulled it from the parent's queue
  ])
);

-- ---------------------------------------------------------------
-- Indexes the flow actually queries on
-- ---------------------------------------------------------------
-- The parent's queue, and the student's pending section.
CREATE INDEX IF NOT EXISTS idx_bookings_pending_parent_approval
  ON public.bookings (student_id, requested_at DESC)
  WHERE status = 'PENDING_PARENT_APPROVAL';

-- The expiry sweep on /api/cron/send-reminders (§4.2: do not add a second cron).
CREATE INDEX IF NOT EXISTS idx_bookings_request_expiry
  ON public.bookings (expires_at)
  WHERE status = 'PENDING_PARENT_APPROVAL';

-- Webhook fulfilment looks the booking up by Checkout session.
CREATE INDEX IF NOT EXISTS idx_bookings_checkout_session
  ON public.bookings (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Decision 5: tutors never see pending requests
-- ---------------------------------------------------------------
-- "Tutors never see pending requests. No tentative state." §4.6 is explicit
-- that the tutor sees a booking only once payment clears. The live policy
-- exposes every row where auth.uid() = tutor_id, which would include requests
-- still sitting in a parent's queue — showing tutors a roster that can silently
-- shrink, and leaking that a particular child asked and was refused.
DROP POLICY IF EXISTS "Tutors can view their bookings" ON public.bookings;
CREATE POLICY "Tutors can view their bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    auth.uid() = tutor_id
    AND status <> 'PENDING_PARENT_APPROVAL'
  );

-- ---------------------------------------------------------------
-- §10.1 "student UPDATEs only to withdraw"
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bookings_guard_request_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- must see the real caller; see mig 217's note
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service role and direct SQL keep full control: the approval route, the
  -- Stripe webhook and the expiry cron all run there.
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  -- 1. The request bookkeeping is written by the server, never by a client.
  IF NEW.requested_at        IS DISTINCT FROM OLD.requested_at
  OR NEW.requested_by        IS DISTINCT FROM OLD.requested_by
  OR NEW.expires_at          IS DISTINCT FROM OLD.expires_at
  OR NEW.frozen_price        IS DISTINCT FROM OLD.frozen_price
  OR NEW.frozen_platform_fee IS DISTINCT FROM OLD.frozen_platform_fee
  OR NEW.decline_reason      IS DISTINCT FROM OLD.decline_reason
  OR NEW.decided_at          IS DISTINCT FROM OLD.decided_at
  OR NEW.decided_by          IS DISTINCT FROM OLD.decided_by
  OR NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id
  THEN
    RAISE EXCEPTION 'booking request fields are not user-writable'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Leaving the parent's queue. Withdrawal by the student is the only move a
  --    client may make; approval must go through the route that takes the money.
  IF OLD.status = 'PENDING_PARENT_APPROVAL'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'WITHDRAWN' AND auth.uid() = OLD.student_id THEN
      NULL;  -- §28
    ELSE
      RAISE EXCEPTION
        'a request awaiting parent approval cannot be moved to % from a user request', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. And nobody may put a booking back into the queue to get a second
  --    decision out of a parent, or to reset a declined one.
  IF NEW.status = 'PENDING_PARENT_APPROVAL'
     AND OLD.status IS DISTINCT FROM 'PENDING_PARENT_APPROVAL' THEN
    RAISE EXCEPTION 'a booking cannot be moved into PENDING_PARENT_APPROVAL from a user request'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_guard_request_columns ON public.bookings;
CREATE TRIGGER trg_bookings_guard_request_columns
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_guard_request_columns();

-- No parent UPDATE policy is added, deliberately, and this is a documented
-- narrowing of §10.1's "Linked parent UPDATEs status, reason and decided
-- fields". A policy cannot create a Stripe Checkout session or re-check
-- capacity, so approval has to happen in a server route regardless (§4.4/§4.5);
-- granting the parent a direct UPDATE path in addition would be a second,
-- weaker way to reach the same rows -- one that could mark a booking approved
-- without any money moving. The parent's authority is checked in the route.

COMMIT;

-- =====================================================
-- Notification types (§4.3 in-app half)
-- =====================================================
-- The constraint is NOT VALID upstream and stays that way: validating it would
-- fail on whatever historical rows already violate it, which is not this
-- migration's business.
DO $outer$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND rel.relname = 'notifications'
    AND con.conname = 'notifications_type_check';

  IF v_def IS NULL THEN
    RAISE NOTICE 'notifications_type_check not found; skipping';
    RETURN;
  END IF;

  IF v_def LIKE '%parent_approval_request%' THEN
    RAISE NOTICE 'notification types already present; skipping';
    RETURN;
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

  -- Rebuild by splicing the new values into the existing definition, so no
  -- historical type is dropped by a hand-retyped list.
  v_def := replace(
    v_def,
    '''secure_spot_lapsed''::text]',
    '''secure_spot_lapsed''::text, '
    || '''parent_approval_request''::text, '   -- child asked; parent must decide
    || '''parent_approval_outcome''::text, '   -- approved or declined, back to the student
    || '''seat_unavailable_refunded''::text]'  -- §4.5 auto-refund
  );

  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check '
       || substring(v_def from position('CHECK' in v_def)) || ' NOT VALID';
END
$outer$;
