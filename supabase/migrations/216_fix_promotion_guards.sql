-- ============================================================
-- MIGRATION 216: THE PROMOTION GUARDS NEVER GUARDED ANYTHING
-- iTutor Database
-- ============================================================
--
-- Migration 190 §2 added a trigger to stop a tutor setting their own
-- admin_boost / pin_rank, because the profiles UPDATE policy
-- ("profiles_user_update_own_v2") lets any user update their own row across
-- ALL columns. 215 copied that trigger for groups, whose UPDATE policy is
-- likewise `tutor_id = auth.uid()` across all columns.
--
-- Both were declared SECURITY DEFINER, and inside a SECURITY DEFINER function
-- current_user is the function OWNER, not the caller. So this line:
--
--     IF auth.role() = 'service_role'
--        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
--
-- evaluated `current_user = 'postgres'` for EVERY caller, took the early
-- return, and allowed the write. Measured on staging as an authenticated
-- tutor: SECURITY DEFINER reported current_user=postgres while the same probe
-- as SECURITY INVOKER reported current_user=authenticated.
--
-- Consequence, live since 190 shipped: a tutor could PATCH their own profile
-- row from the browser with admin_boost=100 and pin_rank=1 and take the top
-- of both marketplaces. Nothing in the app offers that, so this is a hole
-- rather than a known behaviour, but it needed no special tooling to use.
--
-- A trigger has no reason to be SECURITY DEFINER: it only reads NEW and OLD.
-- Dropping it makes current_user the caller's real Postgres role, which is
-- what the check always meant:
--
--   authenticated / anon      a signed-in user or visitor  → blocked
--   service_role              the admin API                → allowed
--   postgres / supabase_admin migrations                   → allowed
--
-- current_user is the role PostgREST actually switched to, not a claim, so
-- unlike auth.role() it cannot be influenced by the request body.
--
-- Verified after applying: as the owning tutor, admin_boost and pin_rank are
-- both refused on profiles and on groups, while an ordinary edit to the same
-- row still succeeds; the admin API (service_role) and set_group_pin_order
-- still write both.
-- ============================================================

BEGIN;

-- Roles trusted to set promotion columns. Everything else is a caller we do
-- not want writing them, including 'authenticated'.
CREATE OR REPLACE FUNCTION public.is_promotion_writer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT current_user IN ('postgres', 'service_role', 'supabase_admin');
$fn$;

-- ── profiles (from mig 190) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_promotion_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF public.is_promotion_writer() THEN
    RETURN NEW;
  END IF;

  IF NEW.admin_boost               IS DISTINCT FROM OLD.admin_boost
     OR NEW.pin_rank               IS DISTINCT FROM OLD.pin_rank
     OR NEW.admin_boost_note       IS DISTINCT FROM OLD.admin_boost_note
     OR NEW.admin_boost_updated_at IS DISTINCT FROM OLD.admin_boost_updated_at
     OR NEW.admin_boost_updated_by IS DISTINCT FROM OLD.admin_boost_updated_by THEN
    RAISE EXCEPTION 'admin_boost / pin_rank are admin-only and cannot be set by this role';
  END IF;

  RETURN NEW;
END;
$fn$;

-- ── groups (from mig 215) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_group_promotion_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF public.is_promotion_writer() THEN
    RETURN NEW;
  END IF;

  IF NEW.admin_boost               IS DISTINCT FROM OLD.admin_boost
     OR NEW.pin_rank               IS DISTINCT FROM OLD.pin_rank
     OR NEW.admin_boost_note       IS DISTINCT FROM OLD.admin_boost_note
     OR NEW.admin_boost_updated_at IS DISTINCT FROM OLD.admin_boost_updated_at
     OR NEW.admin_boost_updated_by IS DISTINCT FROM OLD.admin_boost_updated_by THEN
    RAISE EXCEPTION 'admin_boost / pin_rank are admin-only and cannot be set by this role';
  END IF;

  RETURN NEW;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.is_promotion_writer() TO anon, authenticated, service_role;

-- Any promotion a tutor may have given themselves while the guard was open.
-- Nothing in the product writes these except the admin API, which always
-- stamps admin_boost_updated_by, so an unstamped non-zero value was not set
-- by an admin.
UPDATE public.profiles
   SET admin_boost = 0, pin_rank = NULL
 WHERE (admin_boost <> 0 OR pin_rank IS NOT NULL)
   AND admin_boost_updated_by IS NULL;

COMMIT;
