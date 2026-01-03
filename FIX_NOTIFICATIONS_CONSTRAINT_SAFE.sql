-- SAFE FIX: Check existing notification types first, then update constraint

-- Step 1: Check what notification types currently exist in the database
SELECT 
    'Existing notification types in database' as info,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC;

-- Step 2: Drop the constraint safely
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

-- Step 3: Add constraint with ALL possible types (including any we might have missed)
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- Original types
    'booking_request',
    'booking_accepted',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'new_message',
    
    -- Parent approval workflow types
    'booking_needs_parent_approval',
    'booking_parent_approved',
    'booking_parent_rejected',
    
    -- Lesson offer types
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered',
    'counter_offer_accepted',
    
    -- Session types
    'booking_confirmed',
    'session_created',
    'session_rescheduled',
    'session_cancelled',
    
    -- Additional common types (in case we missed any)
    'booking_request_received',
    'booking_request_sent',
    'message_received',
    'payment_received',
    'payment_sent'
));

-- Step 4: Verify the constraint was added
SELECT 
    'Constraint updated successfully!' as status,
    conname as constraint_name
FROM pg_constraint
WHERE conname = 'notifications_type_check'
AND conrelid = 'public.notifications'::regclass;

-- Step 5: Verify no notifications violate the new constraint
SELECT 
    'Checking for any violations...' as info,
    COUNT(*) as violation_count
FROM notifications
WHERE type NOT IN (
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
    'booking_request_received',
    'booking_request_sent',
    'message_received',
    'payment_received',
    'payment_sent'
);







