-- =====================================================
-- 240_finder.sql
-- Find Your iTutor — the Finder and the demand ledger
-- =====================================================
-- The build spec numbers this 218. 217-238 were taken between the spec being
-- written (canonical tree at 216, base affe50b) and this build; 239 is the
-- product_events dedupe index. Renumbered to 240.
--
-- THREE DEPARTURES FROM THE SPEC'S SCHEMA, each forced by what the columns
-- actually contain. All three would fail silently rather than error.
--
-- 1. AVAILABILITY IS ONE BLOCK ARRAY, NOT day_bucket x time_bucket.
--    The spec proposes day_bucket ('weekday'|'weekend'|'either') crossed with
--    time_bucket ('morning'|'afternoon'|'evening'|'any'). That is 12 cells, and
--    lib/matching/availability.ts documents that three of them contain zero
--    classes against the live catalogue — and that weekday_morning is not a
--    thing a family can be offered at all, because it is school hours. A family
--    picking Weekdays + Morning would always no-match, and the ledger would
--    record demand that supply can never satisfy.
--    So this stores AvailabilityBlock[] from that module — the six blocks
--    measured to cover 100% of current supply. Same vocabulary as
--    class_match_submissions.availability (migration 232), which is what lets
--    one matcher serve both surfaces.
--
-- 2. LEVEL IS ITS OWN COLUMN, NOT READ FROM subjects.level.
--    Spec §2.2 says to treat subjects.level as authoritative. It is corrupt:
--    lib/matching/subjects.ts records that 131 of 134 rows say 'CSEC',
--    including all 77 CAPE rows. subjects is canonical on (name, curriculum)
--    only. Level is asked separately and stored as a CanonicalLevel from
--    lib/matching/levels.ts.
--
-- 3. THERE IS NO groups.subject_id TO MATCH ON.
--    Spec §5.1 filters candidates on "subject matches the requested
--    subject_id". groups.subject is nullable free text with no foreign key
--    (migration 087). subject_id here records what the family PICKED from the
--    canonical list; the matcher resolves it to subjects.name and compares via
--    normaliseSubject whole-word containment. An equality join would return
--    nothing for every row.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.finder_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOT NULL: /find is auth-gated, so a request always has an account behind
  -- it. This is the deliberate trade in the build plan §1 — no anonymous-to
  -- -account stitching, every event carries a user_id, and the cost is that
  -- demand from people who abandon at signup never reaches the ledger.
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Parent flow only. Nullable even for parents: a parent reaching the Finder
  -- usually has no linked child yet, and blocking on the invite-and-accept
  -- sequence strands the highest-intent audience. child_label holds the first
  -- name they typed; the account is linked at enrolment, not before.
  child_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  child_label  text,

  -- Re-runs insert a new row rather than overwriting, so preference drift over
  -- time stays queryable.
  run_number   integer     NOT NULL DEFAULT 1,

  subject_id   uuid        REFERENCES public.subjects(id),
  level        text,
  availability_blocks text[] NOT NULL DEFAULT '{}',
  lesson_type  text        CHECK (lesson_type IN ('group','one_on_one','either')),
  budget_max   numeric(10,2),
  urgency      text        CHECK (urgency IN ('now','this_month','exploring')),

  match_class  text        CHECK (match_class IN ('exact','near','none')),
  results      jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Which single soft dimension missed, on a `near`. Required for a near match,
  -- not decorative: it is what lets the UI say "everything fits except the
  -- time" and send the family back to the one step that needs changing.
  near_miss_on text,

  attribution  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finder_requests_near_needs_dimension
    CHECK (match_class <> 'near' OR near_miss_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_finder_user
  ON public.finder_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finder_subject
  ON public.finder_requests(subject_id);

ALTER TABLE public.finder_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own finder requests" ON public.finder_requests;
CREATE POLICY "own finder requests" ON public.finder_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service role manages finder requests" ON public.finder_requests;
CREATE POLICY "service role manages finder requests" ON public.finder_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------
-- Demand ledger
-- ---------------------------------------------------------------------
-- Every Finder submission writes one row, INCLUDING exact matches. The ledger
-- is the demand map, not the failure log — "what are families asking for" is a
-- different question from "what did we fail to serve", and only the first tells
-- teacher acquisition where to recruit.

CREATE TABLE IF NOT EXISTS public.demand_signals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid        NOT NULL REFERENCES public.finder_requests(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  subject_id   uuid        REFERENCES public.subjects(id),
  level        text,
  availability_blocks text[] NOT NULL DEFAULT '{}',
  budget_max   numeric(10,2),
  match_class  text        NOT NULL,

  -- Soft demand vs committed demand. Recruitment should chase the second;
  -- ranking by raw count alone promotes clusters full of people who shrugged.
  notify_optin boolean     NOT NULL DEFAULT false,

  resolved_at  timestamptz,
  resolved_by  uuid        REFERENCES public.groups(id) ON DELETE SET NULL,
  notified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Clustering is GROUP BY over unnest(availability_blocks), not a JSON scan.
-- Partial on unresolved, which is the only set the demand map ever ranks.
CREATE INDEX IF NOT EXISTS idx_demand_cluster
  ON public.demand_signals(subject_id, level)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demand_optin
  ON public.demand_signals(subject_id)
  WHERE notify_optin AND resolved_at IS NULL;

-- The resolution cron reads unresolved rows by block.
CREATE INDEX IF NOT EXISTS idx_demand_blocks
  ON public.demand_signals USING gin (availability_blocks)
  WHERE resolved_at IS NULL;

ALTER TABLE public.demand_signals ENABLE ROW LEVEL SECURITY;

-- Service role only. Deliberately no authenticated read policy: the ledger is
-- a supply-planning artefact and a student has no reason to read other
-- students' requests.
DROP POLICY IF EXISTS "service role manages demand" ON public.demand_signals;
CREATE POLICY "service role manages demand" ON public.demand_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN public.demand_signals.availability_blocks IS
  'AvailabilityBlock[] from lib/matching/availability.ts — the same six-value '
  'vocabulary as class_match_submissions.availability. Cluster with unnest().';
