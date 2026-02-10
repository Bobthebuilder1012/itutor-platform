-- =====================================================
-- FIX: Add notifications_type_check with ALL existing types
-- =====================================================
-- Based on actual types found in the database

-- Drop the existing constraint (without checking rows)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the constraint with ALL notification types that exist in the database
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- Booking related
    'booking_request',
    'booking_request_received',  -- THIS WAS MISSING!
    'booking_accepted',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'booking_confirmed',
    'booking_needs_parent_approval',
    'booking_parent_approved',
    'booking_parent_rejected',
    
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
    'reschedule_request',  -- NEW: For tutor cancellation with reschedule
    
    -- Messages
    'new_message'
));

-- Verify the constraint was added successfully
SELECT 
    '✅ Constraint updated successfully!' as status,
    conname as constraint_name
FROM pg_constraint
WHERE conname = 'notifications_type_check'
AND conrelid = 'public.notifications'::regclass;

-- Verify all existing types are now valid
SELECT 
    '✅ All notification types are now valid:' as status,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC;
