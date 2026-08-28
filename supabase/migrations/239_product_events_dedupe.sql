-- =====================================================
-- 239_product_events_dedupe.sql
-- Find Your iTutor — Phase 0 completion
-- =====================================================
-- Closes a gap in 238. The Phase 0 handover (Task 1) specifies a dedupe index
-- on product_events that 238 shipped without.
--
-- WHY IT MATTERS. The Stripe webhook retries on any 500, and its dedupe table
-- (processing_status) deliberately leaves transient failures un-deduped so
-- Stripe *will* redeliver. Without this index one payment produces several
-- `paid` rows, and every conversion and cost-per-paid-student number downstream
-- is inflated — silently, and in the direction that flatters the campaign.
--
-- Separate migration rather than an edit to 238 because 238 is already pushed
-- and may have been applied.
-- =====================================================

-- Partial, so only events that opt in by carrying a dedupe_key are constrained.
-- Events with no dedupe_key (finder_step, match_viewed) are legitimately
-- repeatable and must not be blocked.
--
-- user_id is part of the key rather than relying on dedupe_key alone: the keys
-- are natural ids (an enrollment id, a subscription payment id), and scoping to
-- the user keeps a collision between two unrelated id spaces from silently
-- swallowing a real event. Note this means rows with user_id IS NULL are not
-- deduped against each other — Postgres treats NULLs as distinct in a unique
-- index — which is correct: the only NULL-user events are anonymous ref_clicks,
-- where every click is its own fact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_once
  ON public.product_events(user_id, event, (props->>'dedupe_key'))
  WHERE props ? 'dedupe_key';

COMMENT ON INDEX public.uq_events_once IS
  'Absorbs duplicate events from retrying webhooks and cron jobs. Callers pass '
  'props.dedupe_key; the resulting unique violation is swallowed, not logged as '
  'an error. Without this, Stripe redeliveries inflate the `paid` count.';
