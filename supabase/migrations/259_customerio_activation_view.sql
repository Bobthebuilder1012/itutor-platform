-- =====================================================
-- CUSTOMER.IO ACTIVATION VIEW
-- =====================================================
-- One flattened row per profile, carrying everything the three activation
-- ladders (tutor / student / parent) branch on. The reconciler in
-- /api/cron/sync-customerio reads this instead of assembling attributes from
-- profiles plus a second tutor_subjects query.
--
-- WHY public. AND NOT integration.
-- The brief names integration.customerio_profiles_v1. PostgREST serves only
-- the schemas listed in the project's Exposed Schemas setting -- a platform
-- toggle with no representation in this repository, which a Supabase branch
-- does not inherit from its parent. Exposing `integration` would also put the
-- relation within reach of anon and authenticated at the HTTP layer, leaving
-- grants as the only gate. Not exposing it at all and granting nobody but
-- service_role is strictly stronger, and it is what the brief actually asks
-- for: "exposed only to the integration role, never anon". The service-role
-- key IS the integration role here.
--
-- WHY security_invoker.
-- Migration 255 is the post-mortem: a view in `public` inherits Supabase's
-- default GRANT ALL to anon and authenticated, and without security_invoker it
-- runs as its owner (postgres, which holds BYPASSRLS) so the base tables' RLS
-- does not apply through it. This view carries emails and phone numbers, so
-- unlike the reporting views in 255 it is NOT re-granted to anon.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Make the timestamps this depends on actually move
-- ---------------------------------------------------------------
-- Verified on staging: profiles has an updated_at trigger; groups and
-- group_enrollments have the COLUMN but no trigger, so it only advances where
-- application code happens to set it by hand (the publish route does; most
-- PATCHes do not). group_members has no update timestamp at all on either
-- database, so a pending -> approved transition moves nothing anywhere.
--
-- Without these three, activation_updated_at below is a lie for edits and the
-- reconciler silently stops noticing them. CREATE TRIGGER has no
-- IF NOT EXISTS, so each is dropped first (the trap migration 246 documents).

DROP TRIGGER IF EXISTS groups_updated_at ON public.groups;
CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS group_enrollments_updated_at ON public.group_enrollments;
CREATE TRIGGER group_enrollments_updated_at
  BEFORE UPDATE ON public.group_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS group_members_updated_at ON public.group_members;
CREATE TRIGGER group_members_updated_at
  BEFORE UPDATE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 2. Indexes the watermark and the counters probe
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_groups_tutor_status
  ON public.groups (tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_group_members_user_status
  ON public.group_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_student_status
  ON public.group_enrollments (student_id, status);
CREATE INDEX IF NOT EXISTS idx_pcl_parent_created
  ON public.parent_child_links (parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pcl_child
  ON public.parent_child_links (child_id);
CREATE INDEX IF NOT EXISTS idx_product_events_class_viewed
  ON public.product_events (user_id, created_at DESC)
  WHERE event = 'class_viewed';

-- ---------------------------------------------------------------
-- 3. The freshness watermark
-- ---------------------------------------------------------------
-- THE DEFECT THIS FIXES. customerio_pending_profiles() compared
-- profiles.updated_at against the sync watermark. Every activation attribute
-- below changes when a GROUP or an ENROLMENT changes -- the profile row is
-- never touched. So a tutor who published their first class would not re-sync,
-- and the Day-4 "publish your class" email would go to someone who already
-- had. Invisible until it happens, and then it happens to everyone.
--
-- Kept as its own lightweight view rather than a column of the big one: the
-- pending query runs every five minutes over every profile and must not have
-- to materialise six LATERAL joins to read one timestamp.
CREATE OR REPLACE VIEW public.customerio_activation_watermarks
WITH (security_invoker = true) AS
SELECT
  p.id AS customer_id,
  -- GREATEST returns NULL only when every argument is NULL, and
  -- profiles.created_at is NOT NULL, so no coalesce is needed on the rest.
  greatest(
    coalesce(p.updated_at, p.created_at),
    (SELECT max(g.updated_at)  FROM public.groups g             WHERE g.tutor_id   = p.id),
    (SELECT max(m.updated_at)  FROM public.group_members m      WHERE m.user_id    = p.id),
    (SELECT max(e.updated_at)  FROM public.group_enrollments e  WHERE e.student_id = p.id),
    (SELECT max(l.created_at)  FROM public.parent_child_links l WHERE l.parent_id  = p.id),
    -- A parent's attributes change when their CHILD joins something.
    (SELECT max(cm.updated_at) FROM public.group_members cm
       JOIN public.parent_child_links cl ON cl.child_id = cm.user_id
      WHERE cl.parent_id = p.id),
    (SELECT max(ce.updated_at) FROM public.group_enrollments ce
       JOIN public.parent_child_links cl2 ON cl2.child_id = ce.student_id
      WHERE cl2.parent_id = p.id),
    (SELECT max(ev.created_at) FROM public.product_events ev
      WHERE ev.user_id = p.id AND ev.event = 'class_viewed')
  ) AS activation_updated_at
FROM public.profiles p;

COMMENT ON VIEW public.customerio_activation_watermarks IS
  'Latest change to anything Customer.io syncs for a profile, including facts '
  'that live on other tables. Drives customerio_pending_profiles(). One net '
  'catches every writer, present and future -- the same argument migration 246 '
  'makes for not hooking each of the ~32 profile write sites.';

-- ---------------------------------------------------------------
-- 4. The activation view
-- ---------------------------------------------------------------
-- ONE ROW PER CUSTOMER IS STRUCTURAL, NOT INCIDENTAL. Every derived fact is
-- either a scalar subquery or a LEFT JOIN LATERAL (... LIMIT 1) ON TRUE. There
-- is no plain join to a many-side, no GROUP BY and no DISTINCT anywhere, so
-- the brief's first non-negotiable cannot be broken by data. Section 6 asserts
-- it at migration time rather than trusting this paragraph.
--
-- DROP then CREATE, not CREATE OR REPLACE: replace cannot change a view's
-- column order or types, so the second iteration of this file would fail.
DROP VIEW IF EXISTS public.customerio_profiles_v1 CASCADE;

CREATE VIEW public.customerio_profiles_v1
WITH (security_invoker = true) AS
SELECT
  -- ---- identity: the auth UUID, never the email -----------------
  p.id                                                   AS customer_id,
  lower(p.email)                                         AS email,
  coalesce(
    nullif(btrim(p.display_name), ''),
    nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), '')
  )                                                      AS first_name,
  p.full_name,
  p.display_name,
  p.username,

  -- ---- role: the brief's account_type ---------------------------
  -- Mutually exclusive by construction. Left NULL where the profile has no
  -- role (3 such rows on staging) so every ladder excludes them: a Customer.io
  -- segment on a NULL attribute matches nothing, which is the safe direction.
  p.role                                                 AS account_type,

  -- ---- consent --------------------------------------------------
  coalesce(p.marketing_consent, true)                    AS marketing_consent,
  p.marketing_consent_at,
  p.marketing_consent_source,
  coalesce(p.terms_accepted, false)                      AS terms_accepted,

  -- ---- lifecycle ------------------------------------------------
  p.created_at,
  p.updated_at,
  w.activation_updated_at,

  -- ---- who they are ---------------------------------------------
  p.country,
  p.region,
  p.school,
  -- The brief's education_level. form_level for learners; a tutor's first
  -- teaching level stands in, since tutors have no form_level of their own.
  coalesce(p.form_level, (p.teaching_levels)[1])         AS education_level,
  p.form_level,
  p.teaching_levels,
  p.subjects_of_study,
  p.tutor_type,
  p.teaching_mode,
  p.billing_mode,
  p.tutor_verification_status,
  p.rating_average,
  p.rating_count,
  p.phone_number,
  p.signup_ref,
  p.first_touch,
  coalesce(p.is_suspended, false)                        AS is_suspended,
  coalesce(p.is_dev_account, false)                      AS is_dev_account,

  -- A tutor carries teaching subjects, everyone else their study subjects, so
  -- one attribute can be segmented on regardless of role.
  CASE WHEN p.role = 'tutor'
       THEN (SELECT min(s.name) FROM public.tutor_subjects ts
               JOIN public.subjects s ON s.id = ts.subject_id
              WHERE ts.tutor_id = p.id)
       ELSE coalesce(
              (p.subjects_of_study)[1],
              (SELECT min(s.name) FROM public.user_subjects us
                 JOIN public.subjects s ON s.id = us.subject_id
                WHERE us.user_id = p.id))
  END                                                    AS primary_subject,
  (SELECT array_agg(DISTINCT s.name)
     FROM public.tutor_subjects ts
     JOIN public.subjects s ON s.id = ts.subject_id
    WHERE ts.tutor_id = p.id)                            AS tutor_subject_names,

  -- ---- profile_complete, per role -------------------------------
  -- "Enough to be matched and listed", which is what the ladder is trying to
  -- cause. Product rules, not facts -- confirm before the copy is written.
  CASE p.role
    WHEN 'tutor' THEN (
      nullif(btrim(coalesce(p.bio, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(p.avatar_url, '')), '') IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.tutor_subjects ts WHERE ts.tutor_id = p.id)
    )
    WHEN 'student' THEN (
      nullif(btrim(coalesce(p.form_level, '')), '') IS NOT NULL
      AND (
        coalesce(array_length(p.subjects_of_study, 1), 0) > 0
        OR EXISTS (SELECT 1 FROM public.user_subjects us WHERE us.user_id = p.id)
      )
    )
    WHEN 'parent' THEN
      EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = p.id)
    ELSE false
  END                                                    AS profile_complete,

  -- ---- learner activation ---------------------------------------
  -- "Joined" lives in two tables with overlapping meaning, so count distinct
  -- classes across their UNION and never join them. group_members' vocabulary
  -- is classifyMembership()'s ENROLLED set; group_enrollments' is the
  -- seat-holding set used by classOccupancy. A pending request is deliberately
  -- excluded: waiting on a tutor is not an activation.
  (SELECT count(DISTINCT j.gid) FROM (
     SELECT m.group_id AS gid FROM public.group_members m
      WHERE m.user_id = p.id AND lower(m.status) IN ('active', 'approved')
     UNION
     SELECT e.group_id FROM public.group_enrollments e
      WHERE e.student_id = p.id
        AND e.status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
   ) j)::int                                             AS classes_joined_count,

  -- ---- parent's primary child -----------------------------------
  -- parent_child_links has no is_primary and no status: a row IS the accepted
  -- link (migration 251). Oldest link wins, tiebroken on child_id so the pick
  -- is deterministic across runs and the attribute does not flap.
  kid.child_id,
  kid.child_name,
  kid.child_level,
  kid.child_primary_subject,
  kid.child_classes_joined_count,
  -- Beyond the brief's contract: a two-child parent must not silently read as
  -- a one-child parent. Both staging parents have two children.
  (SELECT count(*) FROM public.parent_child_links l WHERE l.parent_id = p.id)::int
                                                         AS children_count,

  -- ---- tutor activation -----------------------------------------
  (SELECT count(*) FROM public.groups g
    WHERE g.tutor_id = p.id AND g.archived_at IS NULL)::int
                                                         AS classes_created_count,
  (SELECT count(*) FROM public.groups g
    WHERE g.tutor_id = p.id AND g.archived_at IS NULL
      AND upper(coalesce(g.status, '')) = 'PUBLISHED')::int
                                                         AS published_classes_count,

  fc.first_class_id,
  fc.first_class_name,
  coalesce(fc.class_has_schedule, false)                 AS class_has_schedule,
  coalesce(fc.class_has_start_date, false)               AS class_has_start_date,
  coalesce(fc.class_has_banner, false)                   AS class_has_banner,
  fc.class_first_session_at,
  fc.class_next_session_at,
  fc.class_end_date,

  -- ---- last class viewed ----------------------------------------
  lv.group_id                                            AS last_viewed_class_id,
  lvg.name                                               AS last_viewed_class_name,
  coalesce(nullif(btrim(lvt.display_name), ''), lvt.full_name)
                                                         AS last_viewed_tutor_name,
  lvg.subject                                            AS last_viewed_subject,
  lv.created_at                                          AS last_class_viewed_at

FROM public.profiles p
JOIN public.customerio_activation_watermarks w ON w.customer_id = p.id

LEFT JOIN LATERAL (
  SELECT
    l.child_id,
    coalesce(nullif(btrim(cp.display_name), ''), cp.full_name)      AS child_name,
    cp.form_level                                                   AS child_level,
    coalesce(
      (cp.subjects_of_study)[1],
      (SELECT min(s.name) FROM public.user_subjects us
         JOIN public.subjects s ON s.id = us.subject_id
        WHERE us.user_id = l.child_id))                             AS child_primary_subject,
    (SELECT count(DISTINCT j.gid) FROM (
       SELECT m.group_id AS gid FROM public.group_members m
        WHERE m.user_id = l.child_id AND lower(m.status) IN ('active', 'approved')
       UNION
       SELECT e.group_id FROM public.group_enrollments e
        WHERE e.student_id = l.child_id
          AND e.status IN ('SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED')
     ) j)::int                                                      AS child_classes_joined_count
  FROM public.parent_child_links l
  JOIN public.profiles cp ON cp.id = l.child_id
  WHERE l.parent_id = p.id
  ORDER BY l.created_at ASC, l.child_id ASC
  LIMIT 1
) kid ON TRUE

LEFT JOIN LATERAL (
  SELECT
    g.id                                                            AS first_class_id,
    g.name                                                          AS first_class_name,
    g.end_date                                                      AS class_end_date,
    EXISTS (SELECT 1 FROM public.group_sessions gs WHERE gs.group_id = g.id)
                                                                    AS class_has_schedule,
    -- groups.start_date does not exist and its absence is deliberate
    -- (migration 204). group_sessions.starts_on is the real thing.
    EXISTS (SELECT 1 FROM public.group_sessions gs
             WHERE gs.group_id = g.id AND gs.starts_on IS NOT NULL) AS class_has_start_date,
    -- header_image exists on staging and NOT on production. Read per row
    -- through to_jsonb so CREATE VIEW does not fail on the database that
    -- lacks it -- the defensive form migration 215 already uses.
    (coalesce(
       nullif(btrim(coalesce(g.cover_image, '')), ''),
       nullif(btrim(coalesce(to_jsonb(g) ->> 'header_image', '')), '')
     ) IS NOT NULL)                                                 AS class_has_banner,
    (SELECT min(o.scheduled_start_at)
       FROM public.group_session_occurrences o
       JOIN public.group_sessions gs2 ON gs2.id = o.group_session_id
      WHERE gs2.group_id = g.id)                                    AS class_first_session_at,
    (SELECT min(o.scheduled_start_at)
       FROM public.group_session_occurrences o
       JOIN public.group_sessions gs3 ON gs3.id = o.group_session_id
      WHERE gs3.group_id = g.id
        AND o.scheduled_start_at > now()
        AND o.cancelled_at IS NULL)                                 AS class_next_session_at
  FROM public.groups g
  WHERE g.tutor_id = p.id AND g.archived_at IS NULL
  -- The brief's rule: a published class outranks a draft, then oldest first.
  ORDER BY (upper(coalesce(g.status, '')) = 'PUBLISHED') DESC, g.created_at ASC, g.id ASC
  LIMIT 1
) fc ON TRUE

LEFT JOIN LATERAL (
  SELECT (ev.props ->> 'group_id')::uuid AS group_id, ev.created_at
  FROM public.product_events ev
  WHERE ev.user_id = p.id
    AND ev.event = 'class_viewed'
    -- props is written from a request payload. An unguarded cast would error
    -- the ENTIRE view, for every customer, on one malformed row.
    AND ev.props ->> 'group_id' ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ORDER BY ev.created_at DESC
  LIMIT 1
) lv ON TRUE
LEFT JOIN public.groups   lvg ON lvg.id = lv.group_id
LEFT JOIN public.profiles lvt ON lvt.id = lvg.tutor_id;

COMMENT ON VIEW public.customerio_profiles_v1 IS
  'Flattened Customer.io profile contract (the brief''s '
  'integration.customerio_profiles_v1). Exactly one row per profile. Read only '
  'by the service role, via lib/customerio/sync.ts. Class URLs are NOT built '
  'here: the database does not know NEXT_PUBLIC_APP_URL, and a hardcoded '
  'origin would send production links from every preview branch.';

-- ---------------------------------------------------------------
-- 5. Grants -- stricter than migration 255
-- ---------------------------------------------------------------
-- 255 re-grants SELECT to anon for the marketplace reporting views. These two
-- must NOT follow that half: they carry email addresses and phone numbers.
REVOKE ALL ON public.customerio_profiles_v1            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customerio_activation_watermarks  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customerio_profiles_v1          TO service_role;
GRANT SELECT ON public.customerio_activation_watermarks TO service_role;

-- ---------------------------------------------------------------
-- 6. Repoint the reconciler at the activation watermark
-- ---------------------------------------------------------------
-- The signature and the OUT column names are deliberately UNCHANGED.
-- CREATE OR REPLACE FUNCTION cannot rename a RETURNS TABLE column, so renaming
-- profile_updated_at would force a DROP FUNCTION and open a window in which
-- the already-deployed cron route calls a function that does not exist.
-- The column now carries the activation watermark; the comment says so.
CREATE OR REPLACE FUNCTION public.customerio_pending_profiles(
  p_limit integer DEFAULT 200,
  p_max_failures integer DEFAULT 5
)
RETURNS TABLE(user_id uuid, profile_updated_at timestamptz)
LANGUAGE sql
STABLE
AS $function$
  SELECT w.customer_id, w.activation_updated_at
  FROM public.customerio_activation_watermarks w
  LEFT JOIN public.customerio_sync_state s ON s.user_id = w.customer_id
  WHERE
    -- Never delivered, or something Customer.io cares about has moved since.
    (s.user_id IS NULL OR s.synced_updated_at IS NULL
     OR w.activation_updated_at > s.synced_updated_at)
    -- Park rows that keep failing so one poison profile cannot consume every
    -- run's budget and stall the rest of the queue behind it.
    AND coalesce(s.failure_count, 0) < p_max_failures
  ORDER BY coalesce(s.synced_updated_at, 'epoch'::timestamptz) ASC,
           w.activation_updated_at ASC
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

COMMENT ON FUNCTION public.customerio_pending_profiles(integer, integer) IS
  'Profiles whose Customer.io attributes are behind. OUT column '
  'profile_updated_at now carries the ACTIVATION watermark (see '
  'customerio_activation_watermarks), not profiles.updated_at -- counters that '
  'live on groups and enrolments never touch the profile row. The name is kept '
  'because CREATE OR REPLACE cannot rename a RETURNS TABLE column. '
  'syncProfile() must persist this value, not profiles.updated_at, or every '
  'activation wakeup re-queues forever.';

REVOKE ALL ON FUNCTION public.customerio_pending_profiles(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customerio_pending_profiles(integer, integer) TO service_role;

-- ---------------------------------------------------------------
-- 7. Assert the brief's first non-negotiable, at migration time
-- ---------------------------------------------------------------
-- "The integration view must return exactly one row per customer_id." Checked
-- here rather than hoped for: a fan-out introduced by a later edit to this
-- file fails the migration instead of quietly duplicating campaign sends.
DO $assert$
DECLARE
  v_rows bigint;
  v_profiles bigint;
  v_distinct bigint;
BEGIN
  SELECT count(*), count(DISTINCT customer_id)
    INTO v_rows, v_distinct
    FROM public.customerio_profiles_v1;
  SELECT count(*) INTO v_profiles FROM public.profiles;

  IF v_rows <> v_profiles OR v_distinct <> v_profiles THEN
    RAISE EXCEPTION
      'customerio_profiles_v1 fans out: % rows, % distinct customers, % profiles',
      v_rows, v_distinct, v_profiles;
  END IF;
END
$assert$;

COMMIT;
