-- =====================================================
-- FIND: Which notification types are causing the constraint violation?
-- =====================================================

-- List of types we're trying to allow
WITH allowed_types AS (
    SELECT unnest(ARRAY[
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
        'lesson_offer_received',
        'lesson_offer_accepted',
        'lesson_offer_declined',
        'lesson_offer_countered',
        'counter_offer_accepted',
        'session_created',
        'session_rescheduled',
        'session_cancelled',
        'reschedule_request',
        'new_message'
    ]) AS allowed_type
)

-- Find any types in notifications that are NOT in our allowed list
SELECT 
    '❌ These types are NOT in the constraint:' as issue,
    n.type,
    COUNT(*) as count,
    MIN(n.created_at) as first_created,
    MAX(n.created_at) as last_created
FROM notifications n
WHERE n.type NOT IN (SELECT allowed_type FROM allowed_types)
GROUP BY n.type
ORDER BY count DESC;

-- Also show all unique types for reference
SELECT 
    'ℹ️ ALL notification types in database:' as info,
    type,
    COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY type ASC;
