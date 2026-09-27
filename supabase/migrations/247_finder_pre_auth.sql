-- =====================================================
-- 247_finder_pre_auth.sql
-- The Finder runs before the account exists
-- =====================================================
-- THIS MIGRATION REVERSES A DECISION 240 RECORDED IN CAPITALS. Do not "fix" it
-- back. 240_finder.sql:44-47 says, of `user_id NOT NULL`:
--
--     "NOT NULL: /find is auth-gated, so a request always has an account behind
--      it. This is the deliberate trade in the build plan §1 — no anonymous-to
--      -account stitching, every event carries a user_id, and the cost is that
--      demand from people who abandon at signup never reaches the ledger."
--
-- The owner has reversed that trade. Account creation must not stand in front
-- of the value: a family answers the questionnaire, sees their matches, and is
-- asked for an account only when they want to act on one. Which means a run has
-- to exist before a user does, and be adopted onto the account afterwards.
--
-- The mechanism is not invented here. Class Match Week already does exactly
-- this (`class_match_submissions`, migration 232) and `lib/matching/claim.ts`
-- is already the generalised, table-agnostic version of the adoption
-- algorithm, written for a second caller that did not exist until now. This
-- migration's job is to make `finder_requests` satisfy that function's
-- contract: `{ token, user_id (nullable), role, claimed_at }`.
--
-- ONE REAL DIFFERENCE FROM CMW, AND IT MATTERS.
-- `class_match_submissions` is one row per person — the campaign questionnaire
-- is one-time. `finder_requests` is MANY rows per person: `run_number` exists
-- precisely so preference drift over time stays queryable. That is why:
--   * the token is unique and a FRESH one is minted per completed submission,
--     so one token names exactly one run;
--   * there is no UNIQUE(user_id), and therefore the caller must pass
--     `unclaimPrior: false` to claimTokenRow — its un-claim step exists only to
--     dodge CMW's UNIQUE(user_id), and on this table it would strip user_id
--     from every prior run of anyone who answers anonymously while already
--     having an account (cleared cookies, logged out, second device).
--
-- `run_number` IS ADVISORY ORDERING; `created_at` IS AUTHORITATIVE. Priors can
-- only be counted when a user is known at insert time, so two anonymous runs
-- both read 1. Every reader already orders by created_at DESC
-- (idx_finder_user, getLatestFinderRequest), so nothing depends on the count.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. user_id becomes optional
-- ---------------------------------------------------------------------
ALTER TABLE public.finder_requests
  ALTER COLUMN user_id DROP NOT NULL;

-- CASCADE -> SET NULL. An unclaimed row is now a legitimate permanent state,
-- so a deleted account must LEAVE the run in the ledger rather than delete it
-- — and, through request_id, its demand_signals child with it. The demand map
-- is the thing this feature exists to build; losing rows from it when someone
-- closes their account is the wrong direction to fail in.
-- Matches class_match_submissions.user_id, which is `on delete set null`.
ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_user_id_fkey;
ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 2. The token — the key a row has before it has an owner
-- ---------------------------------------------------------------------
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS token text;

-- Backfill with RANDOM values, never anything derived from `id`.
-- finder_requests.id is already rendered into the browser as the hidden
-- `request_id` field of the notify-me form (components/finder/MatchResults.tsx),
-- so an id-derived token would be a capability anyone could forge from a page
-- they are already looking at. Two UUIDs = 244 bits, and gen_random_uuid() is
-- already this table's PK default so it needs no extension that is not present.
UPDATE public.finder_requests
   SET token = 'legacy_'
             || replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '')
 WHERE token IS NULL;

ALTER TABLE public.finder_requests
  ALTER COLUMN token SET NOT NULL;

-- UNIQUE because claimTokenRow reads `.eq('token', token).maybeSingle()`.
-- A duplicate makes maybeSingle() error, and claimTokenRow swallows its own
-- errors into `{ claimed: false }` — so the failure would be a family silently
-- losing their answers, with nothing in the logs to say the token was the
-- reason.
ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_token_key;
ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_token_key UNIQUE (token);

-- ---------------------------------------------------------------------
-- 3. claimed_at
-- ---------------------------------------------------------------------
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Every row that predates this migration genuinely always belonged to an
-- account. Leaving them NULL would make reporting call the entire history
-- "unclaimed", and would put them on claimTokenRow's slow path if one were
-- ever looked up by token.
UPDATE public.finder_requests
   SET claimed_at = created_at
 WHERE user_id IS NOT NULL AND claimed_at IS NULL;

-- ---------------------------------------------------------------------
-- 4. role — the picker's answer, and a privilege boundary
-- ---------------------------------------------------------------------
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS role text;

UPDATE public.finder_requests fr
   SET role = COALESCE(p.role, 'student')
  FROM public.profiles p
 WHERE p.id = fr.user_id AND fr.role IS NULL;

-- Anything still null is an orphan with no profile to read; default it rather
-- than block the NOT NULL below.
UPDATE public.finder_requests SET role = 'student' WHERE role IS NULL;

-- THE CHECK IS A SECURITY PROPERTY, NOT TIDINESS.
-- claimTokenRow's backfillRole() copies this column into profiles.role when the
-- profile has none. This table is written by an anonymous, public endpoint. An
-- unconstrained role column would therefore be a privilege-escalation
-- primitive: post role='admin', sign up, receive it. The CHECK is the control.
-- Mirrors class_match_submissions_role_check.
ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_role_check;
ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_role_check CHECK (role IN ('student','parent'));

-- No DEFAULT, deliberately. Role is the one thing the picker collected and the
-- only pre-account identity we have; a default would let a caller that forgot
-- to send it silently produce a student run for a parent.
ALTER TABLE public.finder_requests
  ALTER COLUMN role SET NOT NULL;

-- ---------------------------------------------------------------------
-- 5. form_level_label — the profile's vocabulary, kept alongside the matcher's
-- ---------------------------------------------------------------------
-- TWO VOCABULARIES, A ONE-WAY LOSSY MAP, AND ONE MOMENT WHEN BOTH ARE KNOWN.
--
--   `level` holds a CanonicalLevel (lib/matching/levels.ts) — 7 values, what
--   the matcher and subjectsForLevel() gate on.
--   `profiles.form_level` holds a YEAR_LEVELS value — 8 human strings, with
--   Lower 6 and Upper 6 distinct.
--
-- normaliseLearnerLevel collapses both sixth-form values to 'CAPE'
-- (levels.ts:81), so there is NO inverse for CAPE. Deriving the profile value
-- from `level` later would mean inventing a fact about a person. Storing both
-- at answer time is the only lossless option — the same argument 240 makes for
-- storing `level` separately from subjects.level in the first place.
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS form_level_label text;

-- ---------------------------------------------------------------------
-- 6. skipped — a run with no question answered
-- ---------------------------------------------------------------------
-- The Skip control shows the whole unfiltered catalogue. That is a real screen
-- with a real row behind it, but it states no preference, so the UI must not
-- describe it with any match_class copy ('fallback' would say "nothing matched
-- exactly, but here is what we teach in this subject" — no subject was picked).
-- Keyed off this flag rather than off match_class so the two cannot disagree.
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 7. anon_id — the abuse key
-- ---------------------------------------------------------------------
-- /api/finder/submit is now an unauthenticated endpoint that writes rows.
-- itutor_anon is httpOnly and minted by middleware on the first PAGE view
-- (middleware.ts:87-89); middleware skips /api/* entirely, so an API route can
-- never mint it. Its presence therefore proves a real browser rendered a page,
-- and counting rows per anon_id per hour is a rate limit that needs no new
-- table. Also the pre-signup stitch key, since a pre-auth run's product_events
-- carry anon_id and no user_id.
ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS anon_id text;

CREATE INDEX IF NOT EXISTS idx_finder_anon
  ON public.finder_requests(anon_id, created_at DESC)
  WHERE anon_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. A row must be reachable by someone
-- ---------------------------------------------------------------------
-- token is NOT NULL today, so this is currently implied. It is written down
-- anyway: if a later migration ever makes token nullable for authed runs, this
-- is what stops a row that neither an account nor a cookie can find.
ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_identified;
ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_identified
  CHECK (user_id IS NOT NULL OR token IS NOT NULL);

-- ---------------------------------------------------------------------
-- 9. RLS — narrowed, not widened
-- ---------------------------------------------------------------------
-- NO `anon` POLICY. NOT HERE, NOT ANYWHERE.
--
-- A nullable user_id on an RLS'd table looks like a hole, so: every anonymous
-- read and write in this feature goes through getServiceClient() inside a route
-- handler. There is no anon policy anywhere in this database, and every SELECT
-- policy on groups/group_sessions is TO authenticated, so an anonymous client
-- read returns zero rows WITH NO ERROR — indistinguishable from "no supply".
-- 232_class_match_week.sql:265-274 states the same rule for the campaign.
--
-- Unclaimed rows are already invisible to authenticated users for free:
-- `user_id = auth.uid()` evaluates to NULL when user_id is NULL, and NULL is
-- not true. That falls out of three-valued logic rather than needing a clause.
--
-- The change here is a NARROWING. 240 granted FOR ALL, which let a logged-in
-- user UPDATE their own row's token, role and claimed_at — the three columns
-- this migration just made into key material and a privilege boundary. Nothing
-- writes this table as `authenticated` (submit uses the service client), so
-- SELECT is the whole of the legitimate need.
DROP POLICY IF EXISTS "own finder requests" ON public.finder_requests;
CREATE POLICY "own finder requests" ON public.finder_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 10. demand_signals needs nothing
-- ---------------------------------------------------------------------
-- Its user_id is already nullable with ON DELETE SET NULL (240:111). It was
-- only ever pinned transitively, through `request_id NOT NULL` ->
-- finder_requests.user_id NOT NULL, and step 1 released that.
--
-- Deliberately NO token column here either: notify-me authorises by resolving
-- token -> finder_requests.id -> demand_signals.request_id. One hop, one fewer
-- key to keep in sync, and one fewer place a capability can leak.
--
-- What the CLAIM must remember to do, because claimTokenRow does not:
-- set demand_signals.user_id for the adopted request. Leave it null and
-- /api/cron/resolve-demand never emails that family — it checks signal.user_id.

COMMENT ON COLUMN public.finder_requests.token IS
  'Unique per RUN, not per person — a fresh token is minted on every completed '
  'submission. Held in the httpOnly finder_token cookie. The key a run has '
  'before it has an owner; adopted onto an account by lib/finder/claim.ts.';

COMMENT ON COLUMN public.finder_requests.role IS
  'student | parent, from the /start picker. CHECK-constrained because '
  'claimTokenRow copies it into profiles.role and this table is written by an '
  'anonymous public endpoint.';

COMMENT ON COLUMN public.finder_requests.form_level_label IS
  'The profiles.form_level (YEAR_LEVELS) value for this run, kept alongside the '
  'canonical `level` because the map between them is lossy in the CAPE case and '
  'answer time is the only moment both are known.';

-- ---------------------------------------------------------------------
-- 11. Correct a comment 238 got right at the time and this makes wrong
-- ---------------------------------------------------------------------
-- 238_attribution_and_events.sql:58-60 says of product_events.anon_id:
--   "Retained only for pre-signup landing-page events. With the Finder behind
--    auth a user_id is present from finder_started onward, so no stitching job
--    is required."
-- The Finder is no longer behind auth, so most of the funnel is now anon-keyed:
-- finder_started, finder_step, finder_completed, match_returned and match_viewed
-- can all carry anon_id and no user_id. Restated rather than left to mislead the
-- next person who tries to join the funnel. Re-COMMENTed here because a COMMENT
-- edited in an already-applied file never re-runs.
COMMENT ON COLUMN public.product_events.anon_id IS
  'Pre-signup identity, from the httpOnly itutor_anon cookie. Since the Finder '
  'moved in FRONT of the account (migration 247), most of the funnel is '
  'anon-keyed: finder_started through match_viewed may carry anon_id and no '
  'user_id. The join to a user is the signup_completed row, which carries both; '
  'there is still no backfill job stamping user_id onto earlier rows.';
