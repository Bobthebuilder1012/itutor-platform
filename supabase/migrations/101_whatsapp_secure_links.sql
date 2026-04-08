-- Secure WhatsApp group link sharing
-- Layer 1: whatsapp_link stored only on the server
-- Layer 2: single-use tokens with expiry
-- Layer 3: click audit log

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS whatsapp_link text;

-- Single-use redirect tokens (10-minute expiry, burned on use)
CREATE TABLE IF NOT EXISTS public.wa_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text        NOT NULL UNIQUE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_tokens_token    ON public.wa_tokens(token);
CREATE INDEX IF NOT EXISTS idx_wa_tokens_user_grp ON public.wa_tokens(user_id, group_id);

-- Audit log: who clicked the WhatsApp link and when
CREATE TABLE IF NOT EXISTS public.wa_clicks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_clicks_group ON public.wa_clicks(group_id);

ALTER TABLE public.wa_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages wa_tokens" ON public.wa_tokens;
CREATE POLICY "Service role manages wa_tokens"
  ON public.wa_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages wa_clicks" ON public.wa_clicks;
CREATE POLICY "Service role manages wa_clicks"
  ON public.wa_clicks FOR ALL TO service_role
  USING (true) WITH CHECK (true);
