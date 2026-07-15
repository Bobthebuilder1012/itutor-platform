-- Admin audit log: one row per mutating admin action (profile edits, banner
-- changes, class archive/unarchive, and — later — role changes and deletes).
-- Written server-side with the service role only; there are no client RLS
-- policies, so it is not readable/writable from the browser.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email  text,
  action       text NOT NULL,          -- e.g. 'account.update', 'class.archive', 'banner.set'
  target_type  text,                   -- 'account' | 'class' | 'banner' | ...
  target_id    uuid,                   -- profiles.id or groups.id, when applicable
  target_label text,                   -- human-readable (name/email/title) at the time
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- changed fields, before/after, etc.
  reason       text,                   -- optional reason supplied by the admin
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target  ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor   ON public.admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service-role writes/reads only.
