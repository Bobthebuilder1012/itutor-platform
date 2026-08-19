-- Move the live Class Match Week campaign into the current week.
--
-- TEMPORARY, AND FOR TESTING ONLY. This exists to exercise Meet-link
-- generation end to end: a taster can only be scheduled inside the campaign
-- window (the hard bound in app/api/class-match/sessions/route.ts), the link is
-- minted when the session is published, and a campaign dated weeks out means
-- there is no day a teacher can pick today to make that happen.
--
-- WHAT IT CHANGES: `starts_at` and `ends_at` on the one row with status 'live'.
-- Nothing else. No opt-in, session, reservation or coupon is touched.
--
-- WINDOW: today 00:00 through the seventh day 23:59:59, Trinidad wall-clock.
-- Deliberately "the next seven days" rather than Monday-to-Sunday: every day it
-- offers is today or later, so every day in the builder's day picker is one a
-- session can actually be scheduled on. A calendar week would list days already
-- past — pickable in the select, rejected by the server.
--
-- Campaign days and start times are derived from this row and never hard-coded
-- (migration 232), so moving it is the entire change. The builder offers each
-- day of the window at half-hour starts between 05:00 and 21:30 AST.
--
-- BEFORE RUNNING, KEEP THE OLD VALUES. The SELECT below prints them and the
-- UPDATE returns them; paste them into the revert statement at the bottom when
-- testing is done. There is no undo otherwise — the real campaign dates are not
-- recorded anywhere else.
--
-- Run it in the Supabase SQL editor for the environment you are testing.
-- Staging is a BRANCH of production: check which project the editor is pointed
-- at before running, and never run this against production.

-- ── 1. What is live now, and what it will become ─────────────────────────────
select
  id,
  name,
  status,
  starts_at as current_starts_at,
  ends_at   as current_ends_at,
  (date_trunc('day', now() at time zone 'America/Port_of_Spain'))
    at time zone 'America/Port_of_Spain'                     as proposed_starts_at,
  (date_trunc('day', now() at time zone 'America/Port_of_Spain')
    + interval '7 days' - interval '1 second')
    at time zone 'America/Port_of_Spain'                     as proposed_ends_at
from public.class_match_campaigns
where status = 'live';

-- ── 2. Move it ───────────────────────────────────────────────────────────────
-- The RETURNING clause hands back the row's new window. Note the OLD values
-- from step 1 first: this statement overwrites them.
update public.class_match_campaigns
set
  starts_at = (date_trunc('day', now() at time zone 'America/Port_of_Spain'))
                at time zone 'America/Port_of_Spain',
  ends_at   = (date_trunc('day', now() at time zone 'America/Port_of_Spain')
                + interval '7 days' - interval '1 second')
                at time zone 'America/Port_of_Spain'
where status = 'live'
returning id, name, starts_at, ends_at;

-- Nothing updated? There is no live campaign. Either the campaign row is still
-- 'draft' — promote it deliberately, one live row is all the schema allows —
-- or CLASS_MATCH_WEEK_ENABLED is beside the point here: that flag is read in
-- application code, not by this table, so a disabled campaign still shows as
-- 'live' in these results.

-- ── 3. Revert, when testing is done ──────────────────────────────────────────
-- Fill in the values step 1 printed and run this. Leaving the campaign on test
-- dates is how a live countdown ends up pointing at the wrong week.
--
--   update public.class_match_campaigns
--   set starts_at = '<current_starts_at from step 1>',
--       ends_at   = '<current_ends_at from step 1>'
--   where id = '<id from step 1>';
