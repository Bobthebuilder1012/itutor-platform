-- =====================================================
-- FIX PARENT APPROVAL NOTIFICATIONS
-- =====================================================
-- Add new notification types for parent approval workflow

-- Step 1: Drop existing type constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Step 2: Add new constraint with parent approval types
ALTER TABLE notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'booking_request',
    'booking_accepted',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'new_message',
    'booking_request_received',
    'booking_confirmed',
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered',
    'counter_offer_accepted',
    -- NEW: Parent approval types
    'booking_needs_parent_approval',
    'booking_parent_approved',
    'booking_parent_rejected'
));

-- Verification
SELECT 'Parent notification types added successfully!' AS status;






