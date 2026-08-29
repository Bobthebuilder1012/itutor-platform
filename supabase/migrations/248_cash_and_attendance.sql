-- =====================================================
-- 248_cash_and_attendance.sql
-- Cash payments, and a tutor's own attendance marks
-- =====================================================
-- Backs §4, §6 and §7 of the physical-classes UI spec. Two independent
-- additions that ship together because both are prerequisites for the class
-- Payments screen, which shows payment and attendance side by side.
--
-- ── WHY NO NEW ATTENDANCE TABLE ────────────────────────────────────────────
-- The obvious move is `group_attendance_records`, which is even the name
-- app/api/cron/backfill-retention already probes for. It is the wrong move:
-- `session_attendance_log` (migration 196) ALREADY carries student_id,
-- occurrence, group, status and late_minutes, with a UNIQUE on
-- (student_id, occurrence_type, occurrence_id) — exactly one row per person per
-- session, which is the shape a register needs.
--
-- A second table would mean two sources for "was this student here", and the
-- resolution rule between them would have to live somewhere and be got right by
-- every reader. The existing status CHECK is already
-- attended | late | absent | cancelled, so the spec's Present / Late / Absent
-- needs no new vocabulary either.
--
-- What the log lacks is only the tutor's side of it: who marked a row, whether
-- the student was in the room or on the call, and why a mark contradicts what
-- the join log recorded.
--
-- ── WHY CASH IS COLUMNS ON subscription_payments, NOT A NEW LEDGER ─────────
-- A cash payment is the same event as a card payment — an amount, for a period,
-- against an enrolment — differing only in how it arrived and who recorded it.
-- Splitting it into its own table would fork every query that answers "has this
-- family paid", and the class Payments grid is exactly that query.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. Attendance: the tutor's side of the register
-- ---------------------------------------------------------------------

ALTER TABLE public.session_attendance_log
  -- NULL means the row came from the student's own Join click, which is what
  -- every existing row is. A tutor's mark carries their id, so "who said so"
  -- is answerable — and it is what lets the sheet show a mark that contradicts
  -- the join log rather than silently overwriting it.
  ADD COLUMN IF NOT EXISTS marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- HOW they attended, which is NOT the seat they bought.
  -- `group_enrollments.seat_type` is the purchase; this is the evidence for one
  -- session. A physical-seat student who joins the call one week is marked
  -- 'online' here and keeps their physical seat. The spec groups the register by
  -- this column, not by seat, for exactly that reason.
  ADD COLUMN IF NOT EXISTS attendance_mode text,

  -- Captured when a tutor's mark disagrees with the join log — "shows as joined
  -- but was not on camera". Free text because the disagreements are not a closed
  -- set, and a dropdown of guesses would collect worse data than a sentence.
  ADD COLUMN IF NOT EXISTS note text,

  -- When the tutor saved, distinct from `joined_at` (when the student clicked)
  -- and `derived_at` (when a job inferred it). Three different facts.
  ADD COLUMN IF NOT EXISTS marked_at timestamptz;

ALTER TABLE public.session_attendance_log
  DROP CONSTRAINT IF EXISTS session_attendance_log_mode_check;
ALTER TABLE public.session_attendance_log
  ADD CONSTRAINT session_attendance_log_mode_check
  CHECK (attendance_mode IS NULL OR attendance_mode IN ('online','in_person'));

COMMENT ON COLUMN public.session_attendance_log.attendance_mode IS
  'How the student attended THIS session. Not their seat type — a physical-seat '
  'student may join online any week and keeps their seat. Null on rows that '
  'predate the register.';

CREATE INDEX IF NOT EXISTS idx_attendance_log_group_occurrence
  ON public.session_attendance_log (group_id, occurrence_id);

-- ---------------------------------------------------------------------
-- 2. Cash, waiving and voiding on subscription_payments
-- ---------------------------------------------------------------------

ALTER TABLE public.subscription_payments
  -- 'card' for everything that went through Stripe, which is every existing
  -- row. DEFAULT 'card' rather than NULL so the Payments grid's Card/Cash
  -- filter has a definite answer for history it did not record — those really
  -- were card payments, so this is a fact rather than an assumption.
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card',

  -- The tutor who took the money in their hand. Only ever set for cash: the
  -- gateway is the witness for a card payment, a person is the witness here,
  -- and a cash row with no recorder is unauditable.
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS waived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS waived_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waive_reason text,

  -- Voiding is tutor-managed with NO time limit (spec §7): the audit trail is
  -- the control rather than a window. Which is why voided_by and a reason are
  -- not optional in practice even though the column is nullable — nothing else
  -- records that a charge was cancelled by a human rather than by the system.
  ADD COLUMN IF NOT EXISTS voided_at  timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_method_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_method_check
  CHECK (payment_method IN ('card','cash'));

-- A cash payment must name the person who took it. NOT VALID so the constraint
-- binds new rows without a table rewrite, matching how migration 242 added its
-- checks.
ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_cash_needs_recorder;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_cash_needs_recorder
  CHECK (payment_method <> 'cash' OR status <> 'PAID' OR recorded_by IS NOT NULL) NOT VALID;

COMMENT ON COLUMN public.subscription_payments.payment_method IS
  'card | cash. Defaults to card because every row predating this migration '
  'went through a gateway. Cash is collected by the tutor and recorded by them; '
  'iTutor never handles it, which is why recorded_by is required for a paid '
  'cash row.';

-- The Payments grid filters on method and looks for outstanding cash holds.
CREATE INDEX IF NOT EXISTS idx_sub_payments_group_method
  ON public.subscription_payments (group_id, payment_method, status);

-- ---------------------------------------------------------------------
-- 3. Cash holds do not expire
-- ---------------------------------------------------------------------
-- A card checkout parks the seat for 30 minutes and a cron reclaims it. A cash
-- hold has no such clock: the student is going to hand over money in person,
-- which may be days away, and the tutor releases the seat manually. So a cash
-- enrolment is written with pending_payment_expires_at NULL and the reclaim job
-- must not treat NULL as "expired long ago".
--
-- Recorded here rather than only in code because the column's meaning now
-- differs by payment method, and that is not visible from the column alone.
COMMENT ON COLUMN public.group_enrollments.pending_payment_expires_at IS
  'When an unpaid hold lapses. NULL for a CASH hold, which never expires on a '
  'timer — the tutor releases it. Any reclaim query must therefore filter on '
  'a non-null value rather than comparing NULL to now().';
