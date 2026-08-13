-- =====================================================
-- MIGRATION 228: TUTOR-INITIATED CLASS PAUSE (§12.4, resolved)
-- =====================================================
-- Extends migration 227 with the columns the tutor-pause spec needs. 227 left
-- pause_reason='tutor_break' as an unwired enum member pending this decision;
-- this is that decision made.
--
-- THE PRINCIPLE, BECAUSE THE SCHEMA ONLY MAKES SENSE THROUGH IT
-- "A family pays for a quantity of teaching, not a block of calendar." A pause
-- shifts the dates, it does not refund. Time already paid for and undelivered is
-- added to the far end by moving the renewal date.
--
-- Two decisions are load-bearing TOGETHER and must not be revised
-- independently: billing extends rather than refunds, and seats are held for the
-- duration. Release the seats and a returning family finds the class full, so the
-- time they paid for has nowhere to happen and the extension becomes a promise
-- rather than a fact. Anyone editing one of these should read the other first.
--
-- WHY BOTH RENEWAL DATES ARE STORED
-- adjusted_renewal_date is always recomputed as original_renewal_date + total
-- pause days, never incrementally from the previous adjusted value. Incremental
-- adjustment accumulates drift across extensions — three extensions of a
-- fortnight each would land days out. Keeping the original is what makes the
-- recomputation possible, and it is the audit trail for "why does my renewal say
-- 22 January".
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- The subscription record
-- ---------------------------------------------------------------
ALTER TABLE public.group_enrollments
  -- May be future-dated: a tutor_break needs 7 days' notice, so the pause is
  -- scheduled before it exists. paused_at (227) marks when it actually began.
  ADD COLUMN IF NOT EXISTS pause_start             timestamptz,
  -- Mandatory for tutor_break. A pause cannot be open-ended, which is what makes
  -- auto-resume sufficient and a maximum length unnecessary.
  ADD COLUMN IF NOT EXISTS pause_end               timestamptz,
  ADD COLUMN IF NOT EXISTS original_renewal_date   timestamptz,
  ADD COLUMN IF NOT EXISTS adjusted_renewal_date   timestamptz,
  -- Per-family notification tracking, so a retried fan-out does not email the
  -- same household twice about the same pause.
  ADD COLUMN IF NOT EXISTS pause_notified_at       timestamptz;

COMMENT ON COLUMN public.group_enrollments.pause_end IS
  'Mandatory for pause_reason=tutor_break. Auto-resume fires on this date with no action from anyone, which is why no maximum pause length is needed.';
COMMENT ON COLUMN public.group_enrollments.adjusted_renewal_date IS
  'Always original_renewal_date + TOTAL pause days, recomputed from the original on every change. Never derived from the previous adjusted value: that accumulates drift across extensions.';
COMMENT ON COLUMN public.group_enrollments.original_renewal_date IS
  'Preserved for audit and as the base for every recomputation. Re-baselined only when a fresh pause starts with none active.';

-- A tutor_break must name its end. Enforced in the database because an
-- open-ended tutor pause silently becomes an indefinite one, and auto-resume —
-- the reason nobody needs authority to restart billing — has nothing to fire on.
ALTER TABLE public.group_enrollments
  DROP CONSTRAINT IF EXISTS group_enrollments_tutor_break_needs_end;
ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_tutor_break_needs_end CHECK (
    pause_reason IS DISTINCT FROM 'tutor_break' OR pause_end IS NOT NULL
  ) NOT VALID;   -- NOT VALID: existing rows predate the column and have neither.

-- The cron sweep looks for pauses due to start and due to end.
CREATE INDEX IF NOT EXISTS idx_group_enrollments_pause_window
  ON public.group_enrollments (pause_start, pause_end)
  WHERE pause_reason = 'tutor_break';

-- ---------------------------------------------------------------
-- The class: seats held, and enrolment shut from ANNOUNCEMENT
-- ---------------------------------------------------------------
-- Set when the pause is announced, not when it starts. Build note: "Prefer
-- blocking from announcement; enrolling into a class that is about to stop is a
-- poor first experience." It also removes the fan-out edge case entirely — there
-- is no window in which a family can join and miss the pause email.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS enrolment_closed_until timestamptz;

COMMENT ON COLUMN public.groups.enrolment_closed_until IS
  'Set to pause_end at pause ANNOUNCEMENT, not at pause start. Blocks new enrolment for the duration — seats are held for existing families, which is what makes the billing extension real.';

-- ---------------------------------------------------------------
-- Short absences: cancel-and-reschedule bookkeeping (§6 of the spec)
-- ---------------------------------------------------------------
-- Explicitly NOT enforcement. "Unenforced is a policy choice; unrecorded turns
-- every dispute into a judgement call." Nothing here creates a deadline or a
-- billing consequence; it makes "where did my session go" answerable.
--
-- sessions already carries cancelled_at, cancelled_by and cancellation_reason.
-- cancellation_reason IS the spec's cancellation_note — a second near-identical
-- column would just split the same fact across two places, so only the link is
-- added.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS replacement_session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sessions.replacement_session_id IS
  'The rescheduled session that replaced this cancelled one. Null until linked, and staying null forever has no system consequence — rescheduling is deliberately unenforced.';

-- A group class is cancelled per OCCURRENCE, not per session row, so the same
-- bookkeeping goes there. It only had cancelled_at.
ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS cancelled_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_note        text,
  ADD COLUMN IF NOT EXISTS replacement_occurrence_id uuid REFERENCES public.group_session_occurrences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_occurrences_replacement
  ON public.group_session_occurrences (replacement_occurrence_id)
  WHERE replacement_occurrence_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Authority
-- ---------------------------------------------------------------
-- The spec asks for RLS letting the class tutor pause their own class and payers
-- pause their own subscription. Migration 227's guard already blocks ALL client
-- writes to pause state, which is stricter, and it is kept: pausing has to move
-- in step with Stripe, and a row that says paused while the provider keeps
-- charging is the failure where a parent believes they paused and the money
-- keeps leaving. Authority is therefore checked in the routes — the tutor route
-- verifies groups.tutor_id, the payer route verifies the parent-child link — and
-- neither can reach the other's action because they are different endpoints
-- writing different pause_reason values.
--
-- The guard is extended here to cover the new columns for the same reason.
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

  IF NEW.paused_at             IS DISTINCT FROM OLD.paused_at
  OR NEW.paused_by             IS DISTINCT FROM OLD.paused_by
  OR NEW.pause_reason          IS DISTINCT FROM OLD.pause_reason
  OR NEW.resume_at             IS DISTINCT FROM OLD.resume_at
  OR NEW.pause_start           IS DISTINCT FROM OLD.pause_start
  OR NEW.pause_end             IS DISTINCT FROM OLD.pause_end
  OR NEW.original_renewal_date IS DISTINCT FROM OLD.original_renewal_date
  OR NEW.adjusted_renewal_date IS DISTINCT FROM OLD.adjusted_renewal_date THEN
    RAISE EXCEPTION 'subscription pause state is set server-side, alongside the payment provider'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Enrolment closure is a tutor decision about their own class, but it is written
-- by the pause routes rather than by a client, for the same reason: it has to
-- move with the pause it belongs to.
CREATE OR REPLACE FUNCTION public.groups_enrolment_closure_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.enrolment_closed_until IS DISTINCT FROM OLD.enrolment_closed_until THEN
    RAISE EXCEPTION 'enrolment_closed_until is set by the pause flow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_enrolment_closure_guard ON public.groups;
CREATE TRIGGER trg_groups_enrolment_closure_guard
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.groups_enrolment_closure_guard();

COMMIT;
