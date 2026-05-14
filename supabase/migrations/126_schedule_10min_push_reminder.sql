-- =====================================================
-- SCHEDULE 10-MINUTE SESSION PUSH REMINDER
-- =====================================================
-- Adds a pg_cron job that fires every minute and invokes the
-- session-reminder-10-min Edge Function. The function queries for
-- sessions starting in 9-11 minutes and sends push notifications
-- to both student and tutor. Idempotency is guaranteed by
-- notifications_log (unique constraint on user_id, session_id, type).

CREATE EXTENSION IF NOT EXISTS pg_net    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron   WITH SCHEMA extensions;

-- Helper function invoked by the cron job
CREATE OR REPLACE FUNCTION public.trigger_session_push_reminder_10min()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://thjsdcbzlvjradczhgso.supabase.co/functions/v1/session-reminder-10-min',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoanNkY2J6bHZqcmFkY3poZ3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA5MTQsImV4cCI6MjA5MDIxNjkxNH0.4LijqbJ0BugzWUwiZqF3_Lz1E79ect_sMCBtvxpl0jA'
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- Never let a failed HTTP call surface as a cron error
  NULL;
END;
$$;

-- Register (or replace) the per-minute cron job
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'session-push-reminder-10-min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'session-push-reminder-10-min',
    '* * * * *',
    $cron$SELECT public.trigger_session_push_reminder_10min();$cron$
  );
END $$;
