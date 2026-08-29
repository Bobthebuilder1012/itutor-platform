-- =====================================================
-- CUSTOMER.IO DATA WAREHOUSE SYNC (Reverse ETL)
-- =====================================================
-- For Customer.io's "Data Warehouse Sync" source, where Customer.io connects to
-- Postgres and runs this query on a schedule. NOT the same thing as
-- customerio-export-profiles.sql (a one-off CSV export) or the Track API push
-- in lib/customerio/ — see the note at the bottom about which to use.
--
-- Required columns for this source type: userId, timestamp. `email` is a known
-- column. Anything else lands in the traits object automatically, but is
-- prefixed explicitly below so the attribute name in Customer.io is obvious
-- from reading the query.
--
-- ---------------------------------------------------------------------------
-- POSTGRES GOTCHA: every camelCase alias MUST be double-quoted.
-- ---------------------------------------------------------------------------
-- Postgres folds unquoted identifiers to lower case, so the documented example
-- `id AS userId` actually produces a column named `userid`, and Customer.io's
-- required-column check does not find userId. Verified against this database:
-- unquoted `AS userId` came back as `userid`.
--
-- Paste this into CUSTOMER.IO's query editor, not the Supabase SQL editor.
-- `{{last_sync_time}}` is a Customer.io placeholder, not SQL — Supabase will
-- reject it with a syntax error. To test the query in Supabase, temporarily
-- swap that line for a literal, e.g. `p.updated_at > '2026-01-01'::timestamptz`.
--
-- Verified against staging 2026-08-26: quoted "userId" comes back with its
-- capital intact, and all required + recommended checklist fields are present.

SELECT
    -- The identifier. MUST be the Supabase UUID, and must match what the app
    -- sends at runtime (lib/customerio/client.ts identifies by p.id). A
    -- different identifier here creates a second profile per user rather than
    -- updating the one the app already made.
    p.id                                        AS "userId",

    -- Known column, not a trait.
    p.email                                     AS "email",

    p.full_name                                 AS "traits.full_name",
    COALESCE(NULLIF(TRIM(p.display_name), ''),
             SPLIT_PART(TRIM(p.full_name), ' ', 1))
                                                AS "traits.first_name",
    p.role                                      AS "traits.role",
    p.country                                   AS "traits.country",
    p.region                                    AS "traits.region",
    p.school                                    AS "traits.school",
    p.form_level                                AS "traits.grade_level",
    p.subjects_of_study                         AS "traits.subjects",
    p.tutor_verification_status                 AS "traits.tutor_verification_status",

    -- billing_mode comes from migration 224 and I could not confirm it is on
    -- prod. Run the column probe below; if it lists billing_mode, uncomment:
    --   p.billing_mode                         AS "traits.billing_mode",
    -- Worth having — a child on parent_required cannot buy anything, so a
    -- "complete your purchase" campaign needs to exclude them.

    COALESCE(p.is_suspended, FALSE)             AS "traits.is_suspended",

    -- signup_ref / first_touch / last_touch are NOT selected here.
    -- Migration 238 adds them, and 238 is applied to the staging branch but not
    -- to production — which is the database this source connects to. Selecting
    -- signup_ref there fails the whole query with 42703. Add these back once
    -- 238 has been applied to prod:
    --   p.signup_ref                           AS "traits.signup_ref",
    --   p.first_touch->>'utm_source'           AS "traits.utm_source",
    --   p.first_touch->>'utm_campaign'         AS "traits.utm_campaign",

    -- The record timestamp. The query checklist types this as a string, so it
    -- is formatted as ISO 8601 rather than handed over as a Postgres
    -- timestamptz (which renders as "2026-02-10 01:13:23.492574+00" — a space
    -- instead of a T, and no guarantee it parses the same way at the far end).
    TO_CHAR(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                                AS "timestamp",

    -- Recommended: an idempotency key, so a row re-sent by an overlapping or
    -- re-run sync is recognised as the same change rather than applied twice.
    -- Built from id + updated_at so it changes exactly when the profile does.
    p.id::text || ':' || EXTRACT(EPOCH FROM p.updated_at)::bigint::text
                                                AS "messageId"

FROM public.profiles p

-- Incremental watermark. updated_at is safe to rely on here: it is maintained
-- by the profiles_updated_at trigger (migration 001), so it advances on EVERY
-- write, from all ~32 places that touch this table. created_at would not work
-- in this clause — edits to existing profiles would never sync.
--
-- {{last_sync_time}} is a UNIX TIMESTAMP (an integer), not a timestamptz, so
-- the column has to be converted to epoch seconds to compare against it.
-- Comparing a timestamptz directly is what triggers Customer.io's "should be
-- compared to a Unix timestamp" warning.
--
-- If a sync ever gets slow, `p.updated_at > TO_TIMESTAMP({{last_sync_time}})`
-- is equivalent and leaves the column bare so an index on updated_at can be
-- used — but it reads as a timestamptz comparison to Customer.io's linter and
-- re-raises the warning.
WHERE EXTRACT(EPOCH FROM p.updated_at) > {{last_sync_time}}

  -- Undeliverable addresses. Excluded because every hard bounce damages the
  -- sending reputation of the whole domain. is_dev_account alone is NOT enough:
  -- only 1 row on staging has it set, while 10 carry @demo.itutor.test seed
  -- addresses that would all bounce.
  AND p.email IS NOT NULL
  AND TRIM(p.email) <> ''
  AND COALESCE(p.is_dev_account, FALSE) = FALSE
  AND p.email NOT ILIKE '%@demo.itutor.test'
  AND p.email NOT ILIKE '%.test'
  AND p.email NOT ILIKE '%@example.com';


-- ===========================================================================
-- COLUMN PROBE — run this in Customer.io's editor first
-- ===========================================================================
-- Customer.io connects to PRODUCTION, whose schema lags the staging branch, and
-- a single missing column fails the whole query with 42703. Rather than
-- discovering that one column at a time, run this to see exactly what exists on
-- the database Customer.io is actually querying:
--
--   SELECT string_agg(column_name, ', ' ORDER BY column_name) AS available
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'profiles'
--     AND column_name IN (
--       'billing_mode', 'signup_ref', 'first_touch', 'last_touch',
--       'notification_preferences', 'teaching_levels', 'tutor_type',
--       'teaching_mode', 'is_dev_account', 'subjects_of_study', 'region'
--     );
--
-- Whatever it lists is safe to select. Whatever it omits must stay commented
-- out until the relevant migration reaches prod.
--
-- Known origins, so you can tell what a missing column implies:
--   tutor_verification_status  migration 024
--   is_suspended               migration 040
--   teaching_levels            migration 124
--   is_dev_account             migration 183
--   billing_mode               migration 224   <- uncertain on prod
--   notification_preferences   migration 226   <- unapplied even on staging
--   signup_ref / first_touch   migration 238   <- confirmed absent on prod
-- Everything else above is in the base schema (001) and is always present.


-- ===========================================================================
-- WHICH MECHANISM TO USE
-- ===========================================================================
-- This query and lib/customerio/ overlap. They are not both needed for
-- profiles:
--
--   Data Warehouse Sync (this file)   — pull. Customer.io queries the DB on a
--     schedule. Replaces BOTH scripts/customerio-backfill.ts and
--     /api/cron/sync-customerio: the first sync backfills everyone, and the
--     {{last_sync_time}} clause handles the ongoing delta. Less code to own.
--
--   Track API push (lib/customerio/) — push. Needed for the things a scheduled
--     pull cannot do:
--       * events, in seconds rather than at the next sync (a welcome email that
--         arrives 15 minutes after signup is a different product)
--       * profile deletion on account close — a pull only ever adds and
--         updates, so a closed account would stay mailable
--
-- So: if you adopt this file, set CUSTOMERIO_ENABLED=true but consider removing
-- the /api/cron/sync-customerio entry from vercel.json, and keep the event
-- forwarding in lib/analytics/track.ts and the delete hook in
-- app/api/delete-account/route.ts.
--
-- ===========================================================================
-- BEFORE THIS CAN RUN
-- ===========================================================================
-- 1. Customer.io needs a direct Postgres connection. Check this reaches the
--    staging database at all: staging here is a Supabase BRANCH, and direct
--    connections to it have previously only been reachable over IPv6 with the
--    pooler refusing branch connections. If that still holds, this source can
--    only be pointed at production.
-- 2. Create a dedicated read-only role for it. Do not hand over the service
--    role key or the postgres superuser:
--
--      CREATE ROLE customerio_readonly LOGIN PASSWORD '<generated>';
--      GRANT CONNECT ON DATABASE postgres TO customerio_readonly;
--      GRANT USAGE ON SCHEMA public TO customerio_readonly;
--      GRANT SELECT ON public.profiles TO customerio_readonly;
--
--    Granting SELECT on only public.profiles keeps the blast radius of that
--    credential to the columns above, rather than the whole schema.
