-- ============================================================
-- MIGRATION 203: GROUP JOIN NOTIFICATION TYPES
-- iTutor Database
-- ============================================================
--
-- Adds 'join_request' and 'join_request_approved'.
--
-- WHY: two notifications were already being written and have NEVER
-- worked, because their types aren't in this constraint:
--
--   * POST /api/groups/[groupId]/members inserts type 'join_request'
--     when a student asks to join an approval-gated class.
--   * PATCH /api/groups/[groupId]/members/[userId] inserts
--     'ENROLLMENT_CONFIRMED' when the tutor approves them.
--
-- Both inserts violate notifications_type_check, throw, and are
-- swallowed by a `catch {}` marked "non-critical" — so tutors never
-- learned someone wanted to join, and students never learned they'd
-- been approved. The failure was completely silent.
--
-- 'ENROLLMENT_CONFIRMED' is NOT added: it's screaming-case, unlike
-- every other type here, and the route is changed to use
-- 'join_request_approved' instead.
--
-- The list below is the full existing set plus the two new values.
-- Written out rather than computed so the allowed set is reviewable in
-- the diff.
-- ============================================================

BEGIN;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    -- bookings
    'booking_request', 'booking_request_received', 'booking_accepted',
    'booking_confirmed', 'booking_declined', 'booking_counter_offer',
    'booking_cancelled',
    -- messaging / classes
    'new_message', 'new_stream_post', 'class_invite', 'new_class_member',
    'group_session_updated', 'group_removal', 'group_removal_payment_action',
    'with_cause_removal_submitted_for_review', 'with_cause_removal_admin_decision',
    -- NEW: approval-gated class joins
    'join_request', 'join_request_approved',
    -- sessions
    'session_rescheduled', 'tutor_cancelled_session', 'tutor_added_session',
    'attendance_alert', 'rsvp_received',
    -- payments
    'payment_succeeded', 'payment_failed', 'payment_refunded', 'funds_released',
    -- subscriptions
    'subscription_payment_succeeded', 'subscription_activation_delayed',
    'subscription_refund_issued', 'subscription_payment_reminder',
    'subscription_grace_started', 'subscription_suspended',
    'subscription_cancellation_scheduled', 'subscription_cancellation_finalized',
    'subscription_reactivation',
    -- waitlist
    'waitlist_offer_available', 'waitlist_offer_expired',
    -- disputes / payouts
    'noshow_claim_filed', 'noshow_claim_response', 'noshow_claim_escalated',
    'payout_held', 'payout_released', 'reliability_warning_issued',
    'rating_appeal_decided', 'strike_appeal_decided',
    -- misc
    'new_feedback', 'refund_failed_admin_alert',
    -- parent linking
    'parent_invite', 'parent_link_accepted', 'parent_link_declined',
    -- Legacy UPPERCASE types. These were dropped from this list by mistake:
    -- the app still inserts all of them (WAITLIST_AVAILABLE in
    -- /api/enrollments/[id], SESSION_REMINDER in /api/groups/[id]/sessions,
    -- NEW_REVIEW in /api/groups/[id]/reviews, ENROLLMENT_CONFIRMED in
    -- /api/groups/[id]/members/[userId]), so omitting them made every one of
    -- those inserts violate this constraint.
    'SESSION_REMINDER', 'ENROLLMENT_CONFIRMED', 'NEW_ANNOUNCEMENT',
    'SESSION_CANCELLED', 'NEW_REVIEW', 'WAITLIST_AVAILABLE'
  ]::text[])) NOT VALID;

COMMIT;

-- ============================================================
-- VERIFICATION (commented)
-- ============================================================
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'notifications_type_check';
-- Should contain join_request and join_request_approved.
