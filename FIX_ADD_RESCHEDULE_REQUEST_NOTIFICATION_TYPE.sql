-- =====================================================
-- FIX: Add 'reschedule_request' to notifications types
-- =====================================================
-- The tutor_cancel_session function needs this type

-- Drop and recreate constraint with all required types
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_type_check'
    ) THEN
        ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
        RAISE NOTICE '✅ Dropped existing notifications_type_check constraint.';
    END IF;
END
$$;

-- Add the constraint with ALL notification types including reschedule_request
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'booking_request',
    'booking_accepted',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'new_message',
    'booking_needs_parent_approval',
    'booking_parent_approved',
    'booking_parent_rejected',
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered',
    'counter_offer_accepted',
    'booking_confirmed',
    'session_created',
    'session_rescheduled',
    'session_cancelled',
    'reschedule_request'  -- ADDED: For when tutor proposes new time after cancelling
));

-- Verify the constraint was added
SELECT 
    '✅ Notification types updated successfully!' as status,
    conname as constraint_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'notifications_type_check'
AND conrelid = 'public.notifications'::regclass;
