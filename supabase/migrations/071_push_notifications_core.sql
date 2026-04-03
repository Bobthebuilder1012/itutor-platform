-- =====================================================
-- PUSH NOTIFICATIONS (DEVICE-LEVEL) - CORE TABLES
-- =====================================================
-- Adds:
-- - push_tokens: device tokens per user (multi-device)
-- - notifications_log: idempotency log for reminders
-- - sessions index: (status, scheduled_start_at) for fast 10-min window queries

-- 1) PUSH TOKENS TABLE
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Prevent duplicates per user/device token
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_user_token
  ON public.push_tokens(user_id, token);

-- Fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: Users manage only their own tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can view own push tokens'
  ) THEN
    CREATE POLICY "Users can view own push tokens"
      ON public.push_tokens
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can insert own push tokens'
  ) THEN
    CREATE POLICY "Users can insert own push tokens"
      ON public.push_tokens
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can update own push tokens'
  ) THEN
    CREATE POLICY "Users can update own push tokens"
      ON public.push_tokens
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can delete own push tokens'
  ) THEN
    CREATE POLICY "Users can delete own push tokens"
      ON public.push_tokens
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;


-- 2) NOTIFICATIONS LOG TABLE (IDEMPOTENCY / DEDUPE)
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe guarantee: one log row per (user, session, type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_log_user_session_type
  ON public.notifications_log(user_id, session_id, type);

CREATE INDEX IF NOT EXISTS idx_notifications_log_session_id
  ON public.notifications_log(session_id);

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no user-facing policies; service role bypasses RLS for inserts/reads.


-- 3) SESSIONS INDEX FOR 10-MINUTE WINDOW QUERY
-- Supports: WHERE status='SCHEDULED' AND scheduled_start_at BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_sessions_status_scheduled_start
  ON public.sessions(status, scheduled_start_at);

