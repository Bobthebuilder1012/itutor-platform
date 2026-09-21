-- =====================================================
-- CUSTOMER.IO DATA WAREHOUSE SYNC (Reverse ETL) — v2, view-backed
-- =====================================================
-- For Customer.io's "Data Warehouse Sync" source, where Customer.io connects to
-- Postgres and runs this query on a schedule. Paste into CUSTOMER.IO's query
-- editor, not the Supabase SQL editor.
--
-- WHAT CHANGED FROM v1
-- v1 selected ~13 basic columns straight from public.profiles, which is what a
-- Customer.io workspace running it ends up with. It could not carry any
-- activation attribute — classes_created_count, published_classes_count,
-- profile_complete, the child block, the class_has_* booleans — because none of
-- those live on the profiles row. They are computed across groups,
-- group_members, group_enrollments, parent_child_links and product_events.
--
-- Migration 259 put all of that behind one relation, public.customerio_profiles_v1,
-- guaranteed to return exactly one row per profile. This query is that view,
-- flattened into Customer.io's column contract. Every attribute the three
-- activation ladders branch on is now present.
--
-- ---------------------------------------------------------------------------
-- THE WATERMARK IS activation_updated_at, NOT updated_at.
-- ---------------------------------------------------------------------------
-- This is the one line not to "simplify". profiles.updated_at only moves when
-- the profile ROW is written. Every activation counter changes when a GROUP or
-- an ENROLMENT changes, which never touches that row — so a tutor who publishes
-- their first class would never re-sync, and a "publish your class" email would
-- go to someone who already had. activation_updated_at is the greatest of the
-- profile's own timestamp and the last change to anything else Customer.io
-- syncs for them.
--
-- ---------------------------------------------------------------------------
-- POSTGRES GOTCHA: every camelCase alias MUST be double-quoted.
-- ---------------------------------------------------------------------------
-- Postgres folds unquoted identifiers to lower case, so `id AS userId` produces
-- `userid` and Customer.io's required-column check does not find userId.
--
-- `{{last_sync_time}}` is a Customer.io placeholder, not SQL — Supabase will
-- reject it with a syntax error. To test in Supabase, swap that line for
-- `> EXTRACT(EPOCH FROM '2026-01-01'::timestamptz)`.
--
-- Permissions: Customer.io connects as `postgres`, which can read the view.
-- Verified on production 2026-09-21 — `postgres`, `supabase_admin`,
-- `supabase_etl_admin` and `supabase_read_only_user` all have SELECT on it.
-- anon and authenticated deliberately have none (it carries emails and phones).

SELECT
    -- The identifier. MUST be the Supabase UUID, and must match what the app
    -- sends at runtime (lib/customerio/client.ts identifies by the same id). A
    -- different identifier here creates a second profile per user rather than
    -- updating the one the app already made.
    v.customer_id                               AS "userId",

    -- Known column, not a trait. Already lower-cased by the view.
    v.email                                     AS "email",

    -- ---- identity ---------------------------------------------------
    v.full_name                                 AS "traits.full_name",
    v.first_name                                AS "traits.first_name",
    v.username                                  AS "traits.username",
    v.phone_number                              AS "traits.phone",

    -- ---- role. May be NULL, and may be 'admin'. Neither belongs in any
    -- of the three ladders, so segment on it explicitly rather than
    -- relying on a catch-all branch.
    v.account_type                              AS "traits.role",

    -- ---- who they are -----------------------------------------------
    v.country                                   AS "traits.country",
    v.region                                    AS "traits.region",
    v.school                                    AS "traits.school",
    v.education_level                           AS "traits.grade_level",
    v.subjects_of_study                         AS "traits.subjects_of_study",
    v.tutor_subject_names                       AS "traits.tutor_subjects",
    v.primary_subject                           AS "traits.primary_subject",
    v.teaching_levels                           AS "traits.teaching_levels",
    v.tutor_type                                AS "traits.tutor_type",
    v.teaching_mode                             AS "traits.teaching_mode",
    v.tutor_verification_status                 AS "traits.tutor_verification_status",
    v.rating_average                            AS "traits.rating_average",
    v.rating_count                              AS "traits.rating_count",

    -- A child on parent_required billing cannot buy anything themselves, so a
    -- "complete your purchase" campaign must be able to exclude them. Safe to
    -- select now: the view resolves it, and migration 224 is on production.
    v.billing_mode                              AS "traits.billing_mode",

    -- Sent as attributes rather than withheld, so a campaign can exclude them
    -- by segment. Withholding the row would make an unsuspension invisible.
    v.is_suspended                              AS "traits.is_suspended",
    v.is_dev_account                            AS "traits.is_dev_account",

    -- ---- attribution ------------------------------------------------
    v.signup_ref                                AS "traits.signup_ref",
    v.first_touch ->> 'utm_source'              AS "traits.utm_source",
    v.first_touch ->> 'utm_campaign'            AS "traits.utm_campaign",

    -- ---- ACTIVATION: what every ladder's "send only if" test reads ---
    -- Counters are sent as real numbers including zero, never withheld. A step
    -- conditioned on classes_created_count = 0 has to match a tutor who has
    -- none, and an archived last class has to be able to take the count back
    -- DOWN to zero rather than leaving a stale value standing.
    v.profile_complete                          AS "traits.profile_complete",
    v.classes_joined_count                      AS "traits.classes_joined_count",
    v.classes_created_count                     AS "traits.classes_created_count",
    v.published_classes_count                   AS "traits.published_classes_count",

    -- Tutor's first class, published ranked above draft.
    v.first_class_id                            AS "traits.first_class_id",
    v.first_class_name                          AS "traits.first_class_name",
    -- URL built here rather than in the view: the database does not know
    -- NEXT_PUBLIC_APP_URL, and this query only ever runs against production, so
    -- the origin is unambiguous. /student/explore/<id> is the canonical class
    -- page; /classes/<id> only redirects to it.
    CASE WHEN v.first_class_id IS NOT NULL
         THEN 'https://myitutor.com/student/explore/' || v.first_class_id::text
    END                                         AS "traits.first_class_url",
    v.class_has_schedule                        AS "traits.class_has_schedule",
    -- groups.start_date does not exist and its absence is deliberate
    -- (migration 204). This reflects group_sessions.starts_on.
    v.class_has_start_date                      AS "traits.class_has_start_date",
    v.class_has_banner                          AS "traits.class_has_banner",
    v.class_first_session_at                    AS "traits.class_first_session_at",
    v.class_next_session_at                     AS "traits.class_next_session_at",

    -- Parent block. NULL where there is no child — deliberately not zero, or a
    -- childless tutor reads as a parent whose child has joined nothing, which is
    -- exactly the segment the Day-3 parent nudge targets.
    v.child_id                                  AS "traits.child_id",
    v.child_name                                AS "traits.child_name",
    v.child_level                               AS "traits.child_level",
    v.child_primary_subject                     AS "traits.child_primary_subject",
    v.child_classes_joined_count                AS "traits.child_classes_joined_count",
    -- So a two-child parent is not addressed as though they had one.
    v.children_count                            AS "traits.children_count",

    -- Last class viewed. Populates only from the moment class_viewed shipped
    -- (2026-09-21) — it cannot be backfilled, nothing recorded views before.
    v.last_viewed_class_id                      AS "traits.last_viewed_class_id",
    v.last_viewed_class_name                    AS "traits.last_viewed_class_name",
    CASE WHEN v.last_viewed_class_id IS NOT NULL
         THEN 'https://myitutor.com/student/explore/' || v.last_viewed_class_id::text
    END                                         AS "traits.last_viewed_class_url",
    v.last_viewed_tutor_name                    AS "traits.last_viewed_tutor_name",
    v.last_viewed_subject                       AS "traits.last_viewed_subject",
    v.last_class_viewed_at                      AS "traits.last_class_viewed_at",

    -- ---- consent ----------------------------------------------------
    -- marketing_consent_source distinguishes a real answer from the one-off
    -- backfill of accounts that predate the signup checkbox.
    v.marketing_consent                         AS "traits.marketing_opt_in",
    v.marketing_consent_source                  AS "traits.marketing_consent_source",
    -- `unsubscribed` is a Customer.io RESERVED attribute: true stops every
    -- campaign for that profile. Only ever set it true — sending false would
    -- resurrect someone who unsubscribed via Customer.io's own footer link,
    -- because this sync would overwrite their choice on the next run.
    CASE WHEN v.marketing_consent IS FALSE THEN TRUE END
                                                AS "traits.unsubscribed",

    -- ---- required plumbing ------------------------------------------
    -- The record timestamp. The query checklist types this as a string, so it
    -- is formatted ISO 8601 rather than handed over as a timestamptz (which
    -- renders with a space instead of a T and may not parse the same way).
    TO_CHAR(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                                AS "timestamp",

    -- Idempotency key, so a row re-sent by an overlapping or re-run sync is
    -- recognised as the same change rather than applied twice. Built from the
    -- ACTIVATION watermark, so it changes exactly when anything synced changes.
    v.customer_id::text || ':' ||
      EXTRACT(EPOCH FROM v.activation_updated_at)::bigint::text
                                                AS "messageId"

FROM public.customerio_profiles_v1 v

-- Incremental watermark. See the note at the top: this MUST be
-- activation_updated_at, not updated_at.
--
-- {{last_sync_time}} is a UNIX TIMESTAMP (an integer), not a timestamptz, so
-- the column is converted to epoch seconds to compare against it. Comparing a
-- timestamptz directly is what triggers Customer.io's "should be compared to a
-- Unix timestamp" warning.
WHERE EXTRACT(EPOCH FROM v.activation_updated_at) > {{last_sync_time}}

  -- Undeliverable addresses. Every hard bounce damages the sending reputation
  -- of the whole domain. is_dev_account alone is not enough — seed accounts
  -- carry .test addresses without the flag set.
  AND v.email IS NOT NULL
  AND TRIM(v.email) <> ''
  AND v.is_dev_account = FALSE
  AND v.email NOT ILIKE '%@demo.itutor.test'
  AND v.email NOT ILIKE '%.test'
  AND v.email NOT ILIKE '%@example.com';


-- ===========================================================================
-- FIRST RUN: YOU MUST BACKFILL
-- ===========================================================================
-- The WHERE clause above is incremental, so on a normal run it returns only
-- profiles that changed since the last sync — which is why a freshly-saved
-- query reports "0 rows processed" and no new attributes appear. Existing
-- profiles are NOT picked up by an incremental run; their activation watermark
-- is in the past.
--
-- Use Customer.io's own "Resync"/"Backfill" control on the sync if it offers
-- one. If it does not, run the query ONCE with the watermark line replaced by:
--
--   WHERE TRUE
--
-- ...then put the incremental clause back. One backfill run moves every
-- eligible profile (426 on production as of 2026-09-21); after that the
-- incremental clause keeps up on its own, and correctly, because
-- activation_updated_at moves when a class or an enrolment changes and not
-- only when the profile row is touched.


-- ===========================================================================
-- EVENTS ARE A SEPARATE PIPE — this query cannot carry them
-- ===========================================================================
-- A person sync moves ATTRIBUTES. The four events the ladders trigger on
-- (signup_completed, class_created, class_joined, class_viewed) reach
-- Customer.io through the Track API, from lib/customerio/events.ts, at the
-- moment they happen. Nothing in this file affects them.
--
-- Historical events do NOT backfill through the Track API: forwardEvent fires
-- once, live, as the event occurs. product_events on production already holds
-- real class_viewed and class_joined rows from before the credentials were
-- live, and those will never appear in Customer.io.
--
-- So to populate the Data Index, either:
--   (a) trigger fresh ones — view a class, join it, create a class — now that
--       the Track API credentials are live; each forwards within the request; or
--   (b) add a SECOND Data Warehouse Sync of type "event" over public.product_events,
--       which would also carry the history. Sketch:
--
--         SELECT pe.user_id                  AS "userId",
--                pe.event                    AS "event",
--                TO_CHAR(pe.created_at AT TIME ZONE 'UTC',
--                        'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "timestamp",
--                pe.id::text                 AS "messageId",
--                pe.props ->> 'group_id'     AS "properties.group_id",
--                pe.props ->> 'subject'      AS "properties.subject",
--                pe.props ->> 'membership'   AS "properties.membership",
--                pe.props ->> 'seat_source'  AS "properties.seat_source"
--         FROM public.product_events pe
--         WHERE pe.user_id IS NOT NULL
--           AND pe.event IN ('signup_completed','class_created','class_joined','class_viewed')
--           AND EXTRACT(EPOCH FROM pe.created_at) > {{last_sync_time}}
--
--       Anonymous rows are excluded: user_id is NULL on pre-signup events and
--       Customer.io cannot key them to a person. If you add this, note that
--       events would then arrive by BOTH routes — dedupe on "messageId", which
--       is the product_events row id and stable.


-- ===========================================================================
-- THIS QUERY AND lib/customerio/ BOTH SYNC ATTRIBUTES
-- ===========================================================================
-- They overlap, and that is now safe rather than a conflict: since migration
-- 259 both read the SAME relation (customerio_profiles_v1), so they cannot
-- disagree about a value. Last write wins and both writes are identical.
--
--   Data Warehouse Sync (this file)  — pull, hourly. Owns the bulk attribute
--                                      state. Survives app deploys and needs no
--                                      credentials in Vercel.
--   Track API (lib/customerio/)      — push, within the request. Owns the four
--                                      events, and re-pushes a profile
--                                      immediately after class_created and
--                                      class_joined so a ladder's next step
--                                      sees fresh counters rather than waiting
--                                      up to an hour.
--
-- Keep both. Turning the Track API off to avoid the overlap would also turn off
-- every event, which is the half this query cannot replace.
