-- =====================================================
-- MIGRATION 224: PER-CHILD BILLING CONTROLS (§7, §10.5)
-- =====================================================
-- Moves the billing decision onto the LINK, where it belongs.
--
-- profiles.billing_mode already exists and predates parent links. It is a
-- property of a person, which is the wrong shape: the same student can be
-- self-paying today and dependent tomorrow purely because a parent linked to
-- them, and decision 25 (one parent per child) means the setting always belongs
-- to exactly one relationship. Putting it on parent_child_links also means
-- unlinking a parent removes the dependency with the link, instead of leaving a
-- stale 'parent_required' on a student who now has nobody to approve anything —
-- which would queue their requests to a parent who cannot see them.
--
-- profiles.billing_mode is NOT dropped. Several existing readers use it
-- (resolvePayer, the payment functions in migration 021, resolve-role), so a
-- trigger keeps it in step with the link. The link is the source of truth; the
-- profile column is a mirror maintained for those readers.
--
-- §7's SHAPE: A TRIPWIRE, NOT A GATE
-- Enabling self-pay takes effect immediately — it is not pending anything — and
-- fires a security-alert email to the parent. The safety net is not a
-- confirmation dialog (a child with the parent's unlocked phone defeats that);
-- it is that the parent is TOLD, and that completing a password change turns
-- self-pay back off for every child on the account. That last part is why the
-- columns below record who enabled it and when: without that, a parent reading
-- the alert cannot tell a change they made from one they did not.
-- =====================================================

BEGIN;

ALTER TABLE public.parent_child_links
  -- Mirrors profiles.billing_mode's vocabulary so nothing has to translate.
  ADD COLUMN IF NOT EXISTS billing_mode        text NOT NULL DEFAULT 'parent_required'
    CHECK (billing_mode IN ('parent_required', 'self_allowed')),
  ADD COLUMN IF NOT EXISTS self_pay_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS self_pay_enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Null means no limit. §10.5: at the limit, approval is forced regardless of
  -- the toggle above.
  ADD COLUMN IF NOT EXISTS monthly_spend_limit numeric,
  ADD COLUMN IF NOT EXISTS requires_approval   boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.parent_child_links.billing_mode IS
  '§10.5, parent-writable only. Source of truth; profiles.billing_mode is a mirror kept in step by trigger.';
COMMENT ON COLUMN public.parent_child_links.monthly_spend_limit IS
  '§10.5: rolling calendar-month cap in TTD across this child. At the limit every new request needs approval regardless of billing_mode.';

-- ---------------------------------------------------------------
-- Keep the legacy mirror honest
-- ---------------------------------------------------------------
-- SECURITY DEFINER because the writer is the parent, and a parent has no
-- business holding UPDATE on their child's profiles row. The function's whole
-- surface is one column on one row, so widening it is not a lever.
CREATE OR REPLACE FUNCTION public.sync_child_billing_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Statement 1: "There is no dependent student without a linked parent."
    -- Unlinking returns them to self-paying rather than stranding them.
    UPDATE public.profiles SET billing_mode = 'self_allowed' WHERE id = OLD.child_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.billing_mode IS DISTINCT FROM OLD.billing_mode THEN
    UPDATE public.profiles SET billing_mode = NEW.billing_mode WHERE id = NEW.child_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_child_billing_mode ON public.parent_child_links;
CREATE TRIGGER trg_sync_child_billing_mode
  AFTER INSERT OR UPDATE OR DELETE ON public.parent_child_links
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_child_billing_mode();

-- ---------------------------------------------------------------
-- §10.5 "billing_mode parent-writable only, enforced in RLS"
-- ---------------------------------------------------------------
ALTER TABLE public.parent_child_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent updates own link settings" ON public.parent_child_links;
CREATE POLICY "parent updates own link settings" ON public.parent_child_links
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- A WITH CHECK cannot say "and you may not change WHICH child this is", so the
-- structural columns are pinned by trigger. Without this a parent could point
-- their own link row at another family's child and inherit every parent power
-- over them at once.
CREATE OR REPLACE FUNCTION public.parent_child_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id
  OR NEW.child_id  IS DISTINCT FROM OLD.child_id THEN
    RAISE EXCEPTION 'a parent-child link cannot be repointed'
      USING ERRCODE = '42501';
  END IF;

  -- The child is not a party to this decision: §7 makes it a per-child setting
  -- the PARENT controls, and "a child flipping their own mode bypasses the
  -- entire gate".
  IF auth.uid() IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'only the linked parent may change these settings'
      USING ERRCODE = '42501';
  END IF;

  -- Provenance is written by the server, not claimed by the client — the
  -- security email's "if this was not you" depends on it being trustworthy.
  IF NEW.self_pay_enabled_at IS DISTINCT FROM OLD.self_pay_enabled_at
  OR NEW.self_pay_enabled_by IS DISTINCT FROM OLD.self_pay_enabled_by THEN
    RAISE EXCEPTION 'self-pay provenance is set server-side'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parent_child_link_guard ON public.parent_child_links;
CREATE TRIGGER trg_parent_child_link_guard
  BEFORE UPDATE ON public.parent_child_links
  FOR EACH ROW
  EXECUTE FUNCTION public.parent_child_link_guard();

COMMIT;
