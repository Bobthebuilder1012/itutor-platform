-- ============================================================
-- 150_payments_critical_fixes.sql
-- ============================================================
-- Two production blockers in the LuniPay flow:
--
-- 1. payments.booking_id is NOT NULL (mig 020), but slot-conflict
--    handling in the webhook + finalize routes inserts a paid
--    payment row with booking_id = NULL so an operator can refund
--    it. Without this fix that insert errors out and the student is
--    silently charged with no local record.
--
-- 2. notifications.type CHECK was rewritten in mig 123 and dropped
--    every payment-related type. The webhook/finalize/refund routes
--    insert payment_succeeded / payment_failed / payment_refunded /
--    funds_released and silently fail the constraint, so users get
--    zero in-app notifications for any payment event.
--
-- Both are additive: they relax existing constraints, so there's no
-- risk to existing rows.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Allow nullable booking_id for slot-conflict refund stubs.
-- ------------------------------------------------------------
ALTER TABLE public.payments
  ALTER COLUMN booking_id DROP NOT NULL;

-- Guard rail: a NULL booking_id is only valid when the row was
-- explicitly flagged for refund, so we never accidentally orphan a
-- successful payment without a paper trail.
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_orphan_requires_cancel_reason;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_orphan_requires_cancel_reason
  CHECK (booking_id IS NOT NULL OR cancel_reason IS NOT NULL);

-- ------------------------------------------------------------
-- 2. Restore payment-related notification types in the CHECK.
-- ------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- legacy / existing
    'booking_request',
    'booking_request_received',
    'booking_accepted',
    'booking_confirmed',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'new_message',
    'lesson_offer_received',
    'lesson_offer_accepted',
    -- mig 123
    'session_reminder',
    'tutor_cancelled_session',
    'tutor_added_session',
    'new_class_member',
    'member_approved',
    'new_stream_post',
    'new_chat_message',
    'booking_offer',
    'counter_offer',
    'new_feedback',
    'rsvp_received',
    -- payments (restored)
    'payment_succeeded',
    'payment_failed',
    'payment_refunded',
    'funds_released'
  ));

COMMIT;

-- ============================================================
-- Verification:
--   -- Should return false (i.e. nullable):
--   SELECT is_nullable = 'NO' FROM information_schema.columns
--    WHERE table_name='payments' AND column_name='booking_id';
--
--   -- Should succeed:
--   INSERT INTO notifications (user_id, type, title, message)
--   VALUES ('<some uid>', 'payment_succeeded', 't', 'm');
-- ============================================================
