-- =====================================================
-- MIGRATION 226: NOTIFICATION PREFERENCES (§10.6)
-- =====================================================
-- "Per-parent, per-category, per-channel, plus per-child mutes.
--  Categories: booking_request, approval_outcome, payment, feedback_received,
--  feedback_requested, subscription. Channels: push, email. Default all on.
--  No digest category, no attendance category, no parent session-reminder
--  category — none of those send."
--
-- THE CATEGORY LIST IS A PROMISE, NOT A MENU
-- Every category here corresponds to something the platform actually sends. The
-- three §10.6 rules out are absent for a reason: offering a parent a switch for
-- a weekly digest (§21: there is none), for attendance (§6: no email, no push)
-- or for session reminders (§22: student and tutor only) would advertise
-- channels that do not exist. A parent who turns one ON and then hears nothing
-- has been lied to by a checkbox.
--
-- WHY ABSENCE OF A ROW MEANS ENABLED
-- "Default all on" is implemented as: no row = on. Nothing has to be seeded for
-- a new parent, existing parents need no backfill, and adding a seventh category
-- later cannot silently arrive switched off for everyone who registered before
-- it existed. A row is written only when a parent turns something OFF, so the
-- table stores decisions rather than defaults.
--
-- WHAT IS DELIBERATELY NOT SUPPRESSIBLE
-- Only the six categories above pass through this system. The §7 self-pay
-- security alert is not one of them and is therefore unmutable by construction:
-- it exists to tell a parent that someone may have used their account, and a
-- preference set months earlier must not be able to silence that. Same reasoning
-- would apply to any future account-security mail — if it is not a category, it
-- always sends.
-- =====================================================

BEGIN;

-- Stores only the OFF decisions. See the note above.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category   text NOT NULL CHECK (category IN (
                'booking_request', 'approval_outcome', 'payment',
                'feedback_received', 'feedback_requested', 'subscription'
              )),
  channel    text NOT NULL CHECK (channel IN ('push', 'email')),
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON public.notification_preferences (user_id);

-- Per-child mutes: "two children means twice the notifications". Separate from
-- the table above because the axis is different — a parent may want approval
-- outcomes generally but not for the child who books four classes a week.
CREATE TABLE IF NOT EXISTS public.notification_child_mutes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category   text NOT NULL CHECK (category IN (
                'booking_request', 'approval_outcome', 'payment',
                'feedback_received', 'feedback_requested', 'subscription'
              )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, child_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notification_child_mutes_parent
  ON public.notification_child_mutes (parent_id);

-- ---------------------------------------------------------------
-- RLS: a person owns their own preferences, and nobody else's
-- ---------------------------------------------------------------
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_child_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notification preferences" ON public.notification_preferences;
CREATE POLICY "own notification preferences" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- A mute names a child, so it must be a child this parent is actually linked to.
-- Without that check a parent could write mutes referencing any profile id —
-- harmless in effect, but it would let one account enumerate which ids exist.
DROP POLICY IF EXISTS "own child mutes" ON public.notification_child_mutes;
CREATE POLICY "own child mutes" ON public.notification_child_mutes
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (
    parent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.parent_child_links l
      WHERE l.parent_id = auth.uid() AND l.child_id = notification_child_mutes.child_id
    )
  );

-- ---------------------------------------------------------------
-- One place that answers "should this send?"
-- ---------------------------------------------------------------
-- In SQL as well as TypeScript because the send paths are split between
-- application code and (in future) database-side jobs; both must agree, and the
-- rule is small enough that duplicating it as one function is safer than two
-- half-implementations.
CREATE OR REPLACE FUNCTION public.should_notify(
  p_user_id  uuid,
  p_category text,
  p_channel  text,
  p_child_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    -- Anything outside the six categories is not suppressible: security mail
    -- must not be silenceable by a preference set months earlier.
    CASE WHEN p_category NOT IN (
           'booking_request', 'approval_outcome', 'payment',
           'feedback_received', 'feedback_requested', 'subscription'
         ) THEN true
    ELSE
      NOT EXISTS (
        SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = p_user_id
          AND np.category = p_category
          AND np.channel = p_channel
          AND np.enabled = false
      )
      AND (
        p_child_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.notification_child_mutes m
          WHERE m.parent_id = p_user_id
            AND m.child_id = p_child_id
            AND m.category = p_category
        )
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.should_notify(uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.should_notify(uuid, text, text, uuid) TO authenticated;

COMMIT;
