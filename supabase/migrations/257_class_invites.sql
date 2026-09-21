-- =====================================================
-- MIGRATION 257: CLASS INVITES
-- =====================================================
-- The share sheet added in "a tutor can invite students straight from the class
-- card" sends a plain public class URL. It carries no identity: the moment the
-- message is forwarded, who invited whom is gone, and nothing records that an
-- invitation ever happened.
--
-- This puts a real record behind the link, so an invitation can name its sender,
-- an acceptance is attributable, and the invited student lands in the class.
--
-- Modelled on 194_parent_child_invites, with one deliberate difference: these
-- links are MULTI-USE. A link pasted into a WhatsApp group has to work for
-- everyone who taps it, so the invite IS the link and each acceptance is its own
-- redemption row. A named email invite is the same row with invitee_email set
-- and max_redemptions = 1.
--
-- Numbered 257, not 255: staging's head is 254, but 255 (revoke write grants on
-- reporting views) and 256 (video provider account id) are taken on other
-- branches. Migration numbers are not globally unique in this repo — 250 and 251
-- already mean different things on staging and union-staging-payment — so check
-- every branch before claiming the next one.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.class_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  -- Who is inviting. A tutor sharing their own class, or a student sharing a
  -- class they are in — both are legitimate senders.
  inviter_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Set only for a named invite sent to one address. Null for a share link.
  invitee_email   text,
  -- The channel the link was minted for, when known. The channel actually used
  -- is recorded per redemption instead, because one link serves them all.
  source          text,
  token           text NOT NULL UNIQUE,   -- secure random, 32 bytes base64url
  -- Null means unlimited. A named email invite sets 1.
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_invite_redemptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id  uuid NOT NULL REFERENCES public.class_invites(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- joined          = on the roster now
  -- requested       = a parent or tutor gate raised a request instead
  -- pending_payment = a priced class; the seat is not theirs until they pay
  status     text NOT NULL CHECK (status IN ('joined','requested','pending_payment')),
  -- Which button they actually came through, from ?s= on the link.
  source     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, student_id)
);

-- One live share link per (class, inviter) — reopening the share sheet reuses
-- the link rather than minting a row every time. The same partial-index trick
-- 194 uses to stop duplicate invites. Named email invites are excluded, since a
-- tutor may invite many different addresses to one class.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_share_link_per_inviter
  ON public.class_invites (group_id, inviter_id)
  WHERE invitee_email IS NULL AND revoked_at IS NULL;

-- One live named invite per (class, address).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_email_invite_per_class
  ON public.class_invites (group_id, lower(invitee_email))
  WHERE invitee_email IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_class_invites_group   ON public.class_invites (group_id);
CREATE INDEX IF NOT EXISTS idx_class_invites_inviter ON public.class_invites (inviter_id);
CREATE INDEX IF NOT EXISTS idx_class_invite_redemptions_invite
  ON public.class_invite_redemptions (invite_id);
CREATE INDEX IF NOT EXISTS idx_class_invite_redemptions_student
  ON public.class_invite_redemptions (student_id);

-- RLS — defence in depth. The API routes use the service role and bypass this,
-- but a token must never be readable from a browser: anyone able to SELECT
-- class_invites could enumerate live tokens and redeem other people's
-- invitations. So the only SELECT is the inviter reading their own rows, and
-- there is no client write policy of any kind.
ALTER TABLE public.class_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invite_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inviter reads own class invites" ON public.class_invites;
CREATE POLICY "Inviter reads own class invites" ON public.class_invites
  FOR SELECT TO authenticated USING (inviter_id = auth.uid());

DROP POLICY IF EXISTS "Inviter reads redemptions of own invites" ON public.class_invite_redemptions;
CREATE POLICY "Inviter reads redemptions of own invites" ON public.class_invite_redemptions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.class_invites ci
      WHERE ci.id = class_invite_redemptions.invite_id AND ci.inviter_id = auth.uid()
    )
    OR student_id = auth.uid()
  );

-- The notification the inviter gets when someone accepts. 245's header records
-- what happens when this step is skipped: an unlisted type throws, and it
-- silently killed join-request notifications once already.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'booking_request','booking_request_received','booking_accepted','booking_confirmed',
    'booking_declined','booking_counter_offer','booking_cancelled','new_message',
    'new_stream_post','class_invite','new_class_member','group_session_updated',
    'group_removal','group_removal_payment_action','with_cause_removal_submitted_for_review',
    'with_cause_removal_admin_decision','join_request','join_request_approved',
    'session_rescheduled','tutor_cancelled_session','tutor_added_session','attendance_alert',
    'rsvp_received','payment_succeeded','payment_failed','payment_refunded','funds_released',
    'subscription_payment_succeeded','subscription_activation_delayed','subscription_refund_issued',
    'subscription_payment_reminder','subscription_grace_started','subscription_suspended',
    'subscription_cancellation_scheduled','subscription_cancellation_finalized',
    'subscription_reactivation','waitlist_offer_available','waitlist_offer_expired',
    'noshow_claim_filed','noshow_claim_response','noshow_claim_escalated','payout_held',
    'payout_released','reliability_warning_issued','rating_appeal_decided','strike_appeal_decided',
    'new_feedback','refund_failed_admin_alert','parent_invite','parent_link_accepted',
    'parent_link_declined','SESSION_REMINDER','ENROLLMENT_CONFIRMED','NEW_ANNOUNCEMENT',
    'SESSION_CANCELLED','NEW_REVIEW','WAITLIST_AVAILABLE','spot_secured',
    'secure_spot_month_ending','secure_spot_refunded','secure_spot_lapsed',
    'parent_approval_request','parent_approval_outcome','seat_unavailable_refunded',
    'feedback_requested',
    'child_left_class','child_joined_class',
    -- new in 257
    'class_invite_accepted'
  ])) NOT VALID;

COMMIT;
