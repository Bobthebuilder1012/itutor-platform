-- =====================================================
-- FIX: Update notifications_type_check with all existing types
-- =====================================================

-- First, let's see what notification types currently exist
SELECT 
    'Current notification types in database:' as info,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC;

-- Drop the existing constraint
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

-- Add the constraint with ALL notification types
-- Including any that might already exist in the database
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- Booking related
    'booking_request',
    'booking_accepted',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'booking_needs_parent_approval',
    'booking_parent_approved',
    'booking_parent_rejected',
    'booking_confirmed',
    
    -- Lesson offers
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered',
    'counter_offer_accepted',
    
    -- Sessions
    'session_created',
    'session_rescheduled',
    'session_cancelled',
    'reschedule_request',
    
    -- Messages
    'new_message',
    
    -- System/General (add any other types that might exist)
    'system_notification',
    'general',
    'info',
    'warning',
    'error'
));

-- Verify the constraint was added
SELECT 
    '✅ Constraint updated successfully!' as status,
    conname as constraint_name
FROM pg_constraint
WHERE conname = 'notifications_type_check'
AND conrelid = 'public.notifications'::regclass;

-- Show current types again to confirm all are covered
SELECT 
    'Types now in database (should all be valid):' as info,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC;
