-- =====================================================
-- MIGRATION 194: PARENT → CHILD INVITE + CONSENT LAYER
-- =====================================================
-- Replaces the instant parent→student link (app/api/parent/link-child) — which
-- let any "parent" attach themselves to a student's account with no consent —
-- with an email invite the STUDENT must actively accept. parent_child_links
-- stays the final "accepted" state table (unchanged); this invite table sits in
-- front of it.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.parent_child_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_email  text NOT NULL,               -- snapshot at send time (display even if email changes)
  token        text NOT NULL UNIQUE,        -- secure random, 32+ bytes base64url
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT parent_not_child_invite CHECK (parent_id <> child_id)
);

-- One outstanding invite per (parent, child) — blocks duplicate-spam while pending.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_invite_per_pair
  ON public.parent_child_invites (parent_id, child_id) WHERE status = 'pending';

-- Fast lookups by the accept handler + dashboards.
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_child_invites_token ON public.parent_child_invites (token);
CREATE INDEX IF NOT EXISTS idx_parent_child_invites_parent ON public.parent_child_invites (parent_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_child_invites_child  ON public.parent_child_invites (child_id, status);

-- RLS — defense in depth. The API routes use the service role (bypasses RLS),
-- but these keep direct client access correct: a parent sees/creates only their
-- own invites; a child sees/responds to only invites addressed to them.
ALTER TABLE public.parent_child_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parent reads own invites" ON public.parent_child_invites;
CREATE POLICY "Parent reads own invites" ON public.parent_child_invites
  FOR SELECT TO authenticated USING (parent_id = auth.uid() OR child_id = auth.uid());

DROP POLICY IF EXISTS "Parent creates own invites" ON public.parent_child_invites;
CREATE POLICY "Parent creates own invites" ON public.parent_child_invites
  FOR INSERT TO authenticated WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "Child responds to own invites" ON public.parent_child_invites;
CREATE POLICY "Child responds to own invites" ON public.parent_child_invites
  FOR UPDATE TO authenticated USING (child_id = auth.uid()) WITH CHECK (child_id = auth.uid());

COMMIT;
