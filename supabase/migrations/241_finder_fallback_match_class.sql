-- =====================================================
-- 241_finder_fallback_match_class.sql
-- Find Your iTutor — allow the 'fallback' match class
-- =====================================================
-- 240 constrained match_class to exact | near | none. A fourth outcome is now
-- possible: SUBJECT TRUMPS EVERYTHING.
--
-- WHY. No-match was the majority outcome against real supply — 11 teachers, 21
-- classes, and all but one level+subject cell resolving to a single teacher. A
-- family that answers five questions and is shown nothing has been asked to do
-- work for no return, and they do not come back. So when the strict pass finds
-- nothing, the matcher falls back to "any class in the subject you asked for",
-- dropping level, availability and budget from the gate.
--
-- WHY IT IS ITS OWN VALUE RATHER THAN FOLDED INTO 'near'. A fallback class can
-- be the wrong year, the wrong day and over budget at once. Recording it as
-- 'near' would tell the demand map the request was nearly served when it was
-- not, and the map is what teacher acquisition is aimed with. 'fallback' keeps
-- "we showed them something" and "we had what they asked for" as separate facts.
--
-- Prod parity note: 240 must be applied before this.
-- =====================================================

ALTER TABLE public.finder_requests
  DROP CONSTRAINT IF EXISTS finder_requests_match_class_check;

ALTER TABLE public.finder_requests
  ADD CONSTRAINT finder_requests_match_class_check
  CHECK (match_class IN ('exact', 'near', 'fallback', 'none'));

COMMENT ON COLUMN public.finder_requests.match_class IS
  'exact = every gating dimension satisfied. near = exactly one missed, and every '
  'near miss agreed which one (so near_miss_on can name it). fallback = nothing '
  'survived the strict pass, so classes matching only the SUBJECT were shown. '
  'none = the subject itself has no bookable class.';

-- demand_signals.match_class is deliberately unconstrained text (240 declares it
-- NOT NULL with no CHECK), so it already accepts 'fallback'. Left as is: the
-- ledger is an append-only record of what happened, and a constraint there would
-- reject history rather than prevent a bug.

-- The demand map ranks unresolved clusters. A fallback IS unserved demand — the
-- family did not get what they asked for — so it must cluster alongside 'none',
-- which the existing partial index on (subject_id, level) WHERE resolved_at IS
-- NULL already covers.
