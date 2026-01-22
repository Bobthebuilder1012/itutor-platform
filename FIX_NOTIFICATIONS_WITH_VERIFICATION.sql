-- =====================================================
-- FIX: Add notifications_type_check with ALL types including VERIFICATION_REJECTED
-- =====================================================

-- Drop the existing constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the constraint with ALL notification types
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- Booking related
    'booking_request',
    'booking_request_received',
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
    'reschedule_request',
    
    -- Messages
    'new_message',
    
    -- Verification
    'VERIFICATION_REJECTED'
));

-- Verify success
SELECT 
    '✅ Constraint updated successfully!' as status,
    COUNT(*) as total_notifications
FROM notifications;

-- Confirm all types are valid
SELECT 
    '✅ All types valid:' as status,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY type;
