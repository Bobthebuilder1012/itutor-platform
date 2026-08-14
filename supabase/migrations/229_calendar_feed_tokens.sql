-- =====================================================
-- MIGRATION 229: CALENDAR SUBSCRIBE TOKENS
-- =====================================================
-- Backs the ICS feed behind the family calendar's "subscribe link".
--
-- WHY A TOKEN AT ALL
-- Google, Apple and Outlook fetch a subscribed calendar from their own servers
-- on a schedule. They carry no session cookie, so the feed cannot be behind the
-- normal auth check — the URL itself has to be the credential. That is how every
-- ICS feed works, and it means the link is a bearer secret living in a URL that
-- gets pasted into address bars and settings screens.
--
-- WHAT FOLLOWS FROM THAT
--   * The token is long and random, not derived from the user id. A token
--     anyone could compute from a profile id would expose every family's
--     schedule to anyone who could enumerate ids.
--   * It is REVOCABLE. Rotating writes a new token and the old URL stops
--     working, which is the only recovery available once a link has leaked —
--     you cannot un-paste a URL.
--   * It is stored in its own table rather than on profiles, so it can be
--     revoked without touching the profile row, and so no existing profile
--     select accidentally starts returning a credential.
--   * Users get NO write grant. A user who could set their own token could set
--     it to something guessable; minting happens server-side.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  -- One live token per person. Rotating replaces the row rather than
  -- accumulating valid links nobody remembers issuing.
  CONSTRAINT calendar_feed_token_min_length CHECK (length(token) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feed_token_user
  ON public.calendar_feed_tokens (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feed_token_value
  ON public.calendar_feed_tokens (token);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- A person may see THAT they have a token (the settings screen shows the link),
-- and nothing else may. No INSERT/UPDATE/DELETE for anyone: minting and rotating
-- run server-side so the value is always generated, never chosen.
DROP POLICY IF EXISTS "own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "own calendar feed token" ON public.calendar_feed_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.calendar_feed_tokens FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.calendar_feed_tokens FROM anon;

COMMIT;
