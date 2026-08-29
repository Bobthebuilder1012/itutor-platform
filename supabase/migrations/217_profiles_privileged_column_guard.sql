-- =====================================================
-- MIGRATION 217: ROLE / PRIVILEGE ESCALATION GUARD ON profiles
-- =====================================================
-- Handover §2.1. Verified against LIVE policy state, not migrations:
--
--   profiles_update_own_or_recent_v5
--     USING      ((auth.uid() IS NOT NULL AND id = auth.uid())
--                 OR (created_at > now() - '5 min' AND role IS NULL))
--     WITH CHECK ((auth.uid() IS NOT NULL AND id = auth.uid())
--                 OR (created_at > now() - '5 min'))
--
-- No column restriction anywhere. So today any authenticated user can run
--   update profiles set role = 'admin' where id = auth.uid()
-- and is_admin() (role = 'admin') then returns true for them. The second clause
-- is worse: for five minutes after a profile row is created, ANY caller may
-- rewrite it, and the WITH CHECK half does not even keep the role IS NULL
-- condition -- so the row it writes back may carry any role at all.
--
-- WHY A TRIGGER AND NOT A POLICY EDIT
-- Policy here has already drifted from migrations three times (own -> own_or_recent
-- -> v4 -> v5). A trigger sits underneath all of them and survives the next
-- rewrite. It is also the only way to express "this column may not change",
-- which a WITH CHECK cannot say (it sees NEW, never OLD).
--
-- WHAT STAYS OPEN, DELIBERATELY
-- Parent signup is open by policy: anyone may become a parent. A parent with no
-- linked child can do nothing, and linking requires the CHILD to accept an
-- invite (mig 194). So self-service -> parent is permitted and must not be
-- blocked, or /signup/complete-role breaks for every new parent.
-- admin and tutor are different in kind: one grants platform authority, the
-- other payout access. Those are service-role only.
--
-- VERIFIED SAFE AGAINST EVERY LIVE WRITE PATH
-- Every role write in the codebase already runs through a service-role route:
--   /api/auth/complete-profile   getServiceClient().from('profiles').update({role})
--   /api/auth/resolve-role       getServiceClient()
--   /app/auth/callback           getServiceClient()
-- components/auth/SignupForm.tsx puts role in auth user_metadata, which reaches
-- profiles as an INSERT (this trigger is BEFORE UPDATE only). No browser-client
-- code writes any guarded column -- the client-side profiles.update() calls are
-- display_name, teaching_levels and avatar fields.
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------
-- Who is calling?
-- ---------------------------------------------------------------
-- MUST NOT use current_user. Migration 216 had to undo exactly that mistake:
-- inside a SECURITY DEFINER function current_user is the function OWNER, so a
-- guard written against it never guards anything. The request role lives in the
-- JWT that PostgREST sets per request, so read that instead.
--
-- NULL means there is no JWT at all: a migration, psql, or pg_cron. Those are
-- privileged by definition -- and they have to be, or this file could not set a
-- role itself. Anything arriving through PostgREST always has a claim
-- ('anon', 'authenticated' or 'service_role'), so NULL is not reachable from
-- the outside.
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

COMMENT ON FUNCTION public.request_jwt_role() IS
  'Request role from the PostgREST JWT. NULL = no JWT (migration/psql/cron) = privileged. Never use current_user for this: SECURITY DEFINER rewrites it to the owner.';

CREATE OR REPLACE FUNCTION public.is_privileged_request()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.request_jwt_role() IS NULL
      OR public.request_jwt_role() = 'service_role';
$$;

-- ---------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- keep the caller's context; see the note above
SET search_path = public, pg_temp
AS $$
DECLARE
  v_privileged boolean := public.is_privileged_request();
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- role: self-service may only reach a role that carries no authority.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role IN ('parent', 'student') THEN
      NULL;  -- permitted: open parent signup, and student carries nothing
    ELSE
      RAISE EXCEPTION
        'role cannot be changed to % by a user request (service role only)', NEW.role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Verification is a reviewer decision. The same unrestricted policy would
  -- otherwise let a tutor self-approve and appear as VERIFIED in search.
  IF NEW.tutor_verification_status IS DISTINCT FROM OLD.tutor_verification_status THEN
    RAISE EXCEPTION 'tutor_verification_status is not user-writable'
      USING ERRCODE = '42501';
  END IF;

  -- Suspension is an admin decision; /suspended reads this to hold an account.
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    RAISE EXCEPTION 'is_suspended is not user-writable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_privileged_columns();

COMMIT;

-- =====================================================
-- Guard the commission columns too, but only if they exist. They are payout
-- rates set from /api/admin/tutor-commissions; the same policy exposes them.
-- Kept in a separate DO block so a schema without them still applies 217.
-- =====================================================
DO $outer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'commission_rate'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.profiles_guard_commission()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = public, pg_temp
      AS $body$
      BEGIN
        IF public.is_privileged_request() THEN
          RETURN NEW;
        END IF;
        IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
          RAISE EXCEPTION 'commission_rate is not user-writable'
            USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    DROP TRIGGER IF EXISTS trg_profiles_guard_commission ON public.profiles;
    CREATE TRIGGER trg_profiles_guard_commission
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.profiles_guard_commission();
  END IF;
END
$outer$;
