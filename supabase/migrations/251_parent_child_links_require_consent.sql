-- ============================================================
-- MIGRATION 251: A PARENT LINK CAN NO LONGER BE SELF-ISSUED
-- ============================================================
-- The INSERT policy "Parents can create their own links" had:
--
--   with_check: (parent_id = auth.uid())
--               OR (child_id = auth.uid() AND <parent_id is a 'parent'>)
--
-- The first branch has no consent check and no role check, so ANY
-- authenticated user could insert a row naming any student as their child.
-- `authenticated` holds the INSERT grant, so the policy was the only thing
-- standing there — and it permitted exactly what it was named for.
--
-- A row in parent_child_links IS the link; there is no status column. So a
-- forged row immediately satisfied every policy keyed on this table, which on
-- production is: SELECT on bookings, payments, payout_ledger, ratings,
-- session_attendance_log and sessions, plus UPDATE on sessions.
--
-- ── WHY THE POLICY IS REMOVED RATHER THAN REWRITTEN ─────────────────────
-- Every legitimate link is written by the server with the service role, which
-- bypasses RLS: app/api/invites/[token]/respond/route.ts is the only INSERT in
-- the codebase, and it runs only after the invited student accepts.
--
-- An invite-gated rewrite was considered and rejected. The accept route inserts
-- the link BEFORE setting parent_child_invites.status = 'accepted', so a policy
-- keyed on 'accepted' would not describe the real write; and one keyed on a
-- 'pending' invite would let a parent create the link the moment they sent the
-- invitation — bypassing the very consent gate the invite exists to be.
-- Consent is a decision the server makes; the database's enforceable half is
-- "only the server may write here", and that is what removing this states.
--
-- ── AND WHY THE TRIGGER GOES WITH IT ────────────────────────────────────
-- trg_enforce_parent_child_link_policy raised when the child's
-- profiles.account_type = 'self_registered'. That rule belongs to the OLD flow,
-- where a parent could link to (or create) a student account from an email with
-- no consent — there, refusing self-registered accounts was the only protection
-- a real student had.
--
-- That flow is gone. /api/parent/add-child, /create-child and /link-child were
-- deleted; the invite + accept route is the only path, on main as well as here.
-- Under it the trigger is not a safeguard but a fault: a student who
-- self-registered — 133 of them on production — accepts an invitation, the
-- service-role insert raises, and the route does not check the result, so the
-- invite is still marked 'accepted' and the parent is still told it worked.
-- Both sides believe they are linked and no link exists. Removing the trigger
-- is what makes consent from a self-registered student mean something.
--
-- Admins keep their own INSERT policy. SELECT/UPDATE/DELETE are untouched, so
-- existing links, the parent dashboard and the child's own view are unaffected.
-- ============================================================

DROP POLICY IF EXISTS "Parents can create their own links" ON public.parent_child_links;

DROP TRIGGER IF EXISTS trg_enforce_parent_child_link_policy ON public.parent_child_links;
DROP FUNCTION IF EXISTS public.enforce_parent_child_link_policy();

COMMENT ON TABLE public.parent_child_links IS
  'A row IS an accepted parent-child link — there is no status column. Rows are written ONLY by the server (service role) from the invite-accept route, after the student consents; see migration 251. Do not add an authenticated INSERT policy: every predicate available to RLS here is either forgeable (parent_id = auth.uid()) or true before consent (a pending invite).';
