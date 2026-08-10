-- ============================================================
-- MIGRATION 212: SESSION REMINDERS FOR GROUP CLASSES
-- iTutor Database
-- ============================================================
--
-- session_reminders.session_id was NOT NULL with a FK to sessions(id) — the
-- 1:1 table — so the queue physically could not hold a group class reminder.
-- Rather than stand up a second reminder system, the same table now accepts
-- either source, mirroring payout_ledger's requires_source pattern.
--
-- WHY GROUP ROWS ARE WRITTEN AT SEND TIME, NOT QUEUED AHEAD:
--   A 1:1 session has two fixed participants, so its reminders can be queued
--   when the booking is made (see lib/reminders/scheduleReminders). A class
--   roster changes — students join and leave between an occurrence being
--   generated and it happening — so pre-queuing would silently miss anyone
--   who joined later.
--
--   The sender therefore resolves the roster when the reminder is due and
--   INSERTs the row as its claim. The unique index below is what makes that
--   atomic: a re-run, a redeploy or two overlapping polls lose the insert and
--   skip, which is the same guarantee the 1:1 status flip provides.
-- ============================================================

BEGIN;

ALTER TABLE public.session_reminders
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.session_reminders
  ADD COLUMN IF NOT EXISTS group_occurrence_id uuid
    REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE;

ALTER TABLE public.session_reminders
  DROP CONSTRAINT IF EXISTS session_reminders_requires_source;

ALTER TABLE public.session_reminders
  ADD CONSTRAINT session_reminders_requires_source
  CHECK (
    (session_id IS NOT NULL AND group_occurrence_id IS NULL)
    OR (session_id IS NULL AND group_occurrence_id IS NOT NULL)
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_reminders_group_claim
  ON public.session_reminders (group_occurrence_id, recipient_email, reminder_type)
  WHERE group_occurrence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_reminders_group_occurrence
  ON public.session_reminders (group_occurrence_id)
  WHERE group_occurrence_id IS NOT NULL;

COMMENT ON COLUMN public.session_reminders.group_occurrence_id IS
  'Set for group-class reminders instead of session_id. Rows are inserted by the sender as an atomic claim, not queued ahead, because a class roster changes between scheduling and the session.';

COMMIT;
