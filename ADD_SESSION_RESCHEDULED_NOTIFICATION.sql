-- Add 'session_rescheduled' notification type to the notifications table

-- Drop the existing notifications_type_check constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_type_check'
    ) THEN
        ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
        RAISE NOTICE 'Dropped existing notifications_type_check constraint.';
    END IF;
END
$$;

-- Add the new notifications_type_check constraint with session notification types
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
    'session_rescheduled',  -- NEW: For when sessions are rescheduled
    'session_cancelled'     -- NEW: For when sessions are cancelled
));

-- Verify the constraint was added
SELECT 
    'Notification types updated successfully!' as status,
    conname as constraint_name
FROM pg_constraint
WHERE conname = 'notifications_type_check'
AND conrelid = 'public.notifications'::regclass;

