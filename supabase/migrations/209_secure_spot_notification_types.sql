-- ============================================================
-- MIGRATION 209: NOTIFICATION TYPES FOR SECURE YOUR SPOT
-- ============================================================
-- Three new types: spot_secured, secure_spot_month_ending,
-- secure_spot_refunded.
--
-- Every one of the 57 existing values is re-listed, read back off the database
-- rather than recalled. Migration 203 dropped six types by rewriting this
-- constraint from memory and broke live inserts; the list below was verified
-- afterwards to still contain all 57.
--
-- Kept NOT VALID, matching the constraint it replaces.
-- ============================================================

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
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
    'SESSION_CANCELLED','NEW_REVIEW','WAITLIST_AVAILABLE',
    'spot_secured','secure_spot_month_ending','secure_spot_refunded'
  ])) NOT VALID;

COMMIT;
