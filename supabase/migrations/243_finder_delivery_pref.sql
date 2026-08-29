-- =====================================================
-- 243_finder_delivery_pref.sql
-- The Finder learns that not every class is online
-- =====================================================
-- Migration 242 added `groups.class_format` ('online' | 'physical' | 'hybrid')
-- and a venue with a street address. The Finder was built while every class on
-- the platform was online, so it has no way to record — or respect — the one
-- preference that now matters most: whether the family can travel.
--
-- Without this column the Finder will recommend a physical class in San
-- Fernando to a family in Tobago and call it an EXACT match, because the
-- subject, the year, the day and the price all fit. That is a worse failure
-- than showing nothing: it spends the family's trust on a click that could
-- never have worked.
--
-- WHY A NEW COLUMN AND NOT A REUSE OF lesson_type.
--   lesson_type is group vs one-to-one — how many students are in the room.
--   delivery_pref is online vs in person — whether there is a room.
-- They are orthogonal (a one-to-one lesson can be in person; a group class can
-- be online) and folding them into one enum would make three of the six
-- combinations unaskable.
--
-- ON BOTH TABLES, DELIBERATELY. finder_requests is the run; demand_signals is
-- the ledger the demand map ranks. "Fourteen families in Arima want in-person
-- CSEC Maths" is a recruitment instruction; "fourteen families want CSEC Maths"
-- is not, because the two halves of that cluster need different teachers.
--
-- NULLABLE, NO DEFAULT. Rows written before this migration genuinely did not
-- answer the question, and a backfilled 'online' would be an invention — it
-- would claim those families said something they were never asked. Null reads
-- as "unconstrained" everywhere it is consumed, which is what it means.
-- =====================================================

ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS delivery_pref text;

ALTER TABLE public.demand_signals
  ADD COLUMN IF NOT EXISTS delivery_pref text;

-- Constraints added separately and dropped first, so this file is re-runnable.
-- Migration 242 had to be repaired for exactly this reason: ADD CONSTRAINT is
-- not idempotent and a half-applied migration is worse than a failed one.
ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_delivery_pref_check;
ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_delivery_pref_check
  CHECK (delivery_pref IS NULL OR delivery_pref IN ('online','in_person','either'));

ALTER TABLE public.demand_signals
  DROP CONSTRAINT IF EXISTS demand_signals_delivery_pref_check;
ALTER TABLE public.demand_signals
  ADD CONSTRAINT demand_signals_delivery_pref_check
  CHECK (delivery_pref IS NULL OR delivery_pref IN ('online','in_person','either'));

-- The demand map's in-person cluster query. Partial on unresolved for the same
-- reason idx_demand_cluster is: resolved rows are history, never ranked.
CREATE INDEX IF NOT EXISTS idx_demand_delivery
  ON public.demand_signals(delivery_pref, subject_id)
  WHERE resolved_at IS NULL;

COMMENT ON COLUMN public.finder_requests.delivery_pref IS
  'DeliveryPref from lib/matching/delivery.ts. Orthogonal to lesson_type: '
  'this is online vs in person, lesson_type is group vs one-to-one. '
  'NULL means the run predates the question, not that the family said online.';

COMMENT ON COLUMN public.demand_signals.delivery_pref IS
  'Copied from the request so the demand map can rank in-person demand '
  'separately — an online cluster and an in-person cluster in the same subject '
  'need different teachers, so a combined count is not actionable.';

-- ---------------------------------------------------------------------
-- The resolution cron needs to know it has already emailed a family
-- ---------------------------------------------------------------------
-- demand_signals already carries notified_at. What it lacks is a record of
-- WHICH class was announced, so a family that opted in, was told about class A
-- and did not join cannot be told about class B without either spamming them or
-- being permanently silenced. resolved_by holds the group that closed the
-- signal; this is the count of announcements, which is what caps them.
ALTER TABLE public.demand_signals
  ADD COLUMN IF NOT EXISTS notify_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.demand_signals.notify_count IS
  'How many "a class opened" emails this signal has produced. Capped by the '
  'resolution cron so an opt-in cannot become an unsubscribe problem.';
