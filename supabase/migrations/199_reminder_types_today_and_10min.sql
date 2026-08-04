-- ============================================================
-- MIGRATION 199: REMINDER TYPES — 'today' AND '10m'
-- iTutor Database
-- ============================================================
--
-- Extends session_reminders.reminder_type beyond the original
-- '24h' / '1h' set (migration 100) to cover:
--
--   'today'  morning-of notice, queued for 08:00 Trinidad time on the
--            session's LOCAL calendar date
--   '10m'    final nudge, 10 minutes before start
--
-- Both go to the student AND the tutor, as separate rows, so one
-- recipient's bounce can't suppress the other's.
--
-- WHY NO NEW CRON OR SENT-FLAG COLUMNS:
--   session_reminders already stores an absolute send_at per recipient
--   with a status/attempts lifecycle, and a pg_cron job polls
--   `status='pending' AND send_at <= now()` every minute. So:
--     * no date-window query can miss a session between polls
--     * "today" never drifts across a UTC date boundary, because the
--       local date is resolved once at scheduling time
--     * re-runs cannot double-send — status flips to 'sent'
--   Adding reminder_*_sent_at columns to bookings would have duplicated
--   this machinery less safely.
--
-- REQUIRES migration 100 (session_reminders, app_runtime_config, the
-- pg_cron job and trigger_send_session_reminders).
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.session_reminders') IS NULL THEN
    RAISE EXCEPTION
      'session_reminders is missing — apply 100_add_session_reminders.sql first';
  END IF;
END $$;

ALTER TABLE public.session_reminders
  DROP CONSTRAINT IF EXISTS session_reminders_reminder_type_check;

ALTER TABLE public.session_reminders
  ADD CONSTRAINT session_reminders_reminder_type_check
  CHECK (reminder_type IN ('24h', '1h', 'today', '10m'));

-- One row per (session, recipient, type). Makes a double-schedule
-- impossible at the database level rather than relying on the caller
-- cancelling first, which is the last line of defence against a
-- duplicate reminder if scheduleSessionReminders is ever run twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_reminders_unique_per_type
  ON public.session_reminders (session_id, recipient_type, reminder_type);

-- The poller reads pending rows ordered by send_at; '10m' rows are the
-- latency-sensitive ones, so keep that lookup cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_session_reminders_pending_due
  ON public.session_reminders (send_at)
  WHERE status = 'pending';

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'session_reminders_reminder_type_check';
-- Expected: CHECK (reminder_type = ANY (ARRAY['24h','1h','today','10m']))
