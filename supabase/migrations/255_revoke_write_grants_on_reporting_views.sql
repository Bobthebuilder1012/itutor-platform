-- 255: Revoke client write privileges on the read-only reporting views.
--
-- Supabase's default privileges grant ALL (arwdDxtm) on every new relation in
-- `public` to anon and authenticated. For tables that is fine -- RLS gates
-- every row. Views are different: a view has no RLS of its own, and without
-- `security_invoker` it executes as its owner (postgres, which holds
-- BYPASSRLS), so RLS on the underlying tables does not apply through it.
--
-- Postgres treats `group_class_stats` and `tutor_reliability` as
-- auto-updatable (single FROM entry, no GROUP BY/DISTINCT/join), so those
-- inherited INSERT/UPDATE/DELETE grants passed straight through to the base
-- tables `groups` and `tutor_response_metrics` with RLS bypassed -- reachable
-- with the public anon key.
--
-- Nothing in the application writes through any of these views; they are
-- read-only reporting surfaces. Read access is left exactly as it was, so
-- this is a no-op for the marketplace.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE
    public.tutor_session_stats,
    public.tutor_class_stats,
    public.tutor_marketplace_rankings,
    public.tutor_reliability,
    public.group_review_category_averages,
    public.group_class_stats,
    public.group_marketplace_rankings
  FROM anon, authenticated;

-- Re-assert the intended read grants (idempotent; matches migrations 190/192/215).
GRANT SELECT
  ON TABLE
    public.tutor_session_stats,
    public.tutor_class_stats,
    public.tutor_marketplace_rankings,
    public.tutor_reliability,
    public.group_review_category_averages,
    public.group_class_stats,
    public.group_marketplace_rankings
  TO anon, authenticated;
