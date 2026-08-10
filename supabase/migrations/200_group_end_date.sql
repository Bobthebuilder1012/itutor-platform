-- ============================================================
-- MIGRATION 200: CLASS END DATES
-- iTutor Database
-- ============================================================
--
-- Adds groups.end_date so a class stops billing when it actually
-- ends rather than recurring indefinitely.
--
-- NULLABLE ON PURPOSE. Every NEW class is required to have an end
-- date (enforced in the API — "ongoing / no end date" is not an
-- allowed class type), but a NOT NULL column with a default would
-- fabricate an end date for all 7 existing classes. NULL means
-- "not yet backfilled", which is exactly what the tutor-facing
-- backfill gate looks for.
--
-- Once every row is backfilled, this can be tightened to NOT NULL
-- in a follow-up migration. Do NOT do it before then.
--
-- BILLING NOTE: we own the recurring cycle (group_enrollments
-- next_payment_due_at + the process-subscriptions cron), so end_date
-- is enforced by our own cycle logic. There is no Stripe `cancel_at`
-- to keep in sync, because there are no native Stripe Subscription
-- objects in this design.
--
-- PAUSE INTERACTION (decided, not yet built): pausing a class pushes
-- end_date out by the pause duration so students still receive every
-- lesson they paid for. end_date is therefore a MOVING target — treat
-- it as mutable state, never as an immutable contract term.
-- ============================================================

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS end_date date;

COMMENT ON COLUMN public.groups.end_date IS
  'Date the class finishes. Billing stops after this date. NULL only for '
  'pre-migration classes awaiting tutor backfill. Shifts later when a class '
  'is paused, so lesson count stays honest.';

-- Drives the backfill gate: "does this tutor own any class still missing an
-- end date?" Partial, so it stays tiny once backfill is complete.
CREATE INDEX IF NOT EXISTS idx_groups_missing_end_date
  ON public.groups (tutor_id)
  WHERE end_date IS NULL AND archived_at IS NULL;

-- Sanity only: an end date before the class was created is always wrong.
-- Deliberately NOT "end_date > now()" — that would make every class fail
-- validation the day after it legitimately finishes.
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_end_date_after_creation;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_end_date_after_creation
  CHECK (end_date IS NULL OR end_date >= created_at::date);

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT count(*) FILTER (WHERE end_date IS NULL) AS awaiting_backfill,
--        count(*) AS total
-- FROM public.groups WHERE archived_at IS NULL;
