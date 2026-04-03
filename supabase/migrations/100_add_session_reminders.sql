-- Session reminder emails for 24-hour and 1-hour notices.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.session_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('student', 'tutor')),
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '1h')),
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_reminders_status_send_at
  ON public.session_reminders(status, send_at);

CREATE INDEX IF NOT EXISTS idx_session_reminders_session_id
  ON public.session_reminders(session_id);

CREATE TABLE IF NOT EXISTS public.app_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage session reminders" ON public.session_reminders;
CREATE POLICY "Service role can manage session reminders"
ON public.session_reminders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage app runtime config" ON public.app_runtime_config;
CREATE POLICY "Service role can manage app runtime config"
ON public.app_runtime_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trigger_send_session_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  app_url text;
  cron_secret text;
BEGIN
  SELECT value INTO app_url
  FROM public.app_runtime_config
  WHERE key = 'next_public_app_url';

  SELECT value INTO cron_secret
  FROM public.app_runtime_config
  WHERE key = 'cron_secret';

  IF app_url IS NULL OR cron_secret IS NULL THEN
    RAISE NOTICE 'Skipping session reminder cron trigger because app_runtime_config is missing required keys';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := app_url || '/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'send-session-reminders-every-minute'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'send-session-reminders-every-minute',
    '* * * * *',
    $cron$SELECT public.trigger_send_session_reminders();$cron$
  );
END $$;
