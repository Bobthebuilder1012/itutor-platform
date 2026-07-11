-- =====================================================================
-- 187_rotate_edge_fn_auth_to_vault.sql
-- ROTATE EDGE-FUNCTION AUTH OFF THE LEGACY ANON JWT
-- =====================================================================
-- Purpose: replace the hardcoded legacy anon JWT (signed by the legacy
-- JWT secret) used by DB triggers/cron to call Edge Functions, with the
-- NEW Supabase secret key, stored in Vault rather than hardcoded.
--
-- Supersedes the call-site auth in migrations 093, 123 and 126.
--
-- Run order: apply this in the LIVE/PRODUCTION project BEFORE disabling
-- the old anon/service_role keys or revoking the legacy JWT secret.
--
-- Affects three call sites:
--   1) public.trigger_payment_receipt_email()        (was migration 093)
--   2) public.trigger_session_push_reminder_10min()  (was migration 126)
--   3) public.dispatch_push_for_notification()        (was migration 123)
--
-- =====================================================================
-- PREREQUISITE — verify BEFORE applying:
--   The new sb_secret_... keys are OPAQUE tokens, NOT JWTs. If any of the
--   three Edge Functions is deployed with `verify_jwt = true`, its gateway
--   expects a signed JWT and may REJECT an opaque secret key, silently
--   breaking these calls (STEP 4/5 swallow errors). Confirm each function's
--   verify_jwt setting (supabase/config.toml or dashboard) and test in
--   staging first. Internal/cron functions are typically verify_jwt = false.
--
-- SECRET HANDLING:
--   Do NOT commit this file with a real key in it. Leave the placeholder
--   below and paste the live key only into the SQL Editor at run time.
--   Treat any key that has appeared in a file/chat/log as exposed — rotate.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1: Store the new secret key + project ref in Vault (encrypted)
-- ---------------------------------------------------------------------
-- Replace, in the SQL Editor only:
--   <PASTE_NEW_SECRET_KEY>  -> your new key, e.g. sb_secret_...
--   <PROJECT_REF>           -> the live project ref, e.g. nfkrfciozjxrodkusrhh
--
-- Upserts so this script is safe to re-run.

DO $$
DECLARE
  v_new_secret  text := '<PASTE_NEW_SECRET_KEY>';
  v_project_ref text := '<PROJECT_REF>';
BEGIN
  -- Guard: refuse to run with placeholders still in place. Without this,
  -- the literal placeholder would be stored as the bearer token and every
  -- edge call would silently 401 at runtime.
  IF v_new_secret = '<PASTE_NEW_SECRET_KEY>' OR v_new_secret NOT LIKE 'sb_secret_%' THEN
    RAISE EXCEPTION 'Replace <PASTE_NEW_SECRET_KEY> with a rotated sb_secret_... key at runtime only';
  END IF;
  IF v_project_ref = '<PROJECT_REF>' OR v_project_ref !~ '^[a-z]{20}$' THEN
    RAISE EXCEPTION 'Replace <PROJECT_REF> with the live project ref (20 lowercase letters)';
  END IF;

  -- edge function auth bearer
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_fn_bearer') THEN
    PERFORM vault.update_secret(
      (SELECT id FROM vault.secrets WHERE name = 'edge_fn_bearer'),
      v_new_secret
    );
  ELSE
    PERFORM vault.create_secret(v_new_secret, 'edge_fn_bearer',
      'New Supabase secret key used by DB triggers/cron to call Edge Functions');
  END IF;

  -- project ref (so function URLs are not hardcoded per-function)
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_fn_project_ref') THEN
    PERFORM vault.update_secret(
      (SELECT id FROM vault.secrets WHERE name = 'edge_fn_project_ref'),
      v_project_ref
    );
  ELSE
    PERFORM vault.create_secret(v_project_ref, 'edge_fn_project_ref',
      'Project ref for Edge Function base URL');
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- STEP 2: Small helper to read a Vault secret by name
-- ---------------------------------------------------------------------
-- SECURITY DEFINER so the trigger functions (and only them) can read the
-- decrypted value. Ensure the function owner (postgres) can read
-- vault.decrypted_secrets — on Supabase it can.

CREATE OR REPLACE FUNCTION public._edge_secret(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._edge_secret(text) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- STEP 3: Payment-receipt trigger function (was migration 093)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_payment_receipt_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bearer text := public._edge_secret('edge_fn_bearer');
  v_ref    text := public._edge_secret('edge_fn_project_ref');
BEGIN
  IF NEW.status = 'succeeded' AND (OLD.status IS NULL OR OLD.status <> 'succeeded') THEN
    PERFORM net.http_post(
      url     := 'https://' || v_ref || '.supabase.co/functions/v1/send-payment-receipt',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_bearer,
        'apikey',        v_bearer
      ),
      -- net.http_post body is jsonb (do NOT cast to ::text)
      body    := jsonb_build_object('payment_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;
-- trigger definition itself is unchanged; no need to recreate it.


-- ---------------------------------------------------------------------
-- STEP 4: 10-minute session push reminder (was migration 126)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_session_push_reminder_10min()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bearer text := public._edge_secret('edge_fn_bearer');
  v_ref    text := public._edge_secret('edge_fn_project_ref');
BEGIN
  PERFORM net.http_post(
    url := 'https://' || v_ref || '.supabase.co/functions/v1/session-reminder-10-min',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_bearer,
      'apikey',        v_bearer
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- non-blocking: failures surface in Edge Function logs, not here
  NULL;
END;
$$;


-- ---------------------------------------------------------------------
-- STEP 5: Push fan-out on new notification (was migration 123)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bearer text := public._edge_secret('edge_fn_bearer');
  v_ref    text := public._edge_secret('edge_fn_project_ref');
BEGIN
  PERFORM net.http_post(
    url := 'https://' || v_ref || '.supabase.co/functions/v1/send-push-on-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_bearer,
      'apikey',        v_bearer
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- non-blocking: failures surface in Edge Function logs, not here
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------
-- STEP 6: Verify (run after the above succeeds)
-- ---------------------------------------------------------------------
-- a) Confirm the secrets are stored and readable:
--      SELECT public._edge_secret('edge_fn_bearer') IS NOT NULL AS bearer_ok,
--             public._edge_secret('edge_fn_project_ref')         AS project_ref;
--
-- b) Fire the reminder once and confirm a 2xx response. The new keys are
--    opaque (not JWTs), so do NOT look for a decoded "role" claim — instead
--    confirm success via the response status and Edge Function logs:
--      SELECT public.trigger_session_push_reminder_10min();
--      -- then inspect the pg_net response:
--      SELECT id, status_code, content
--      FROM net._http_response
--      ORDER BY created DESC
--      LIMIT 5;
--    Expect status_code 200/2xx. A 401/403 means the function is rejecting
--    the opaque secret key (see PREREQUISITE re: verify_jwt).
--
-- c) Only after all three call sites show 2xx in production should you
--    disable the legacy anon/service_role keys / revoke the legacy JWT secret.
-- =====================================================================
