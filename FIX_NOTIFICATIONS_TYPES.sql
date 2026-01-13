-- =====================================================
-- FIX NOTIFICATIONS TYPE CHECK CONSTRAINT
-- =====================================================
-- Add new lesson offer notification types to allowed values

-- First, check the current constraint
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public' 
  AND constraint_name LIKE '%notifications%type%';

-- Drop the old constraint
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Create new constraint with lesson offer types included
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    -- Original notification types
    'booking_request',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'message_received',
    'payment_received',
    'rating_received',
    -- New lesson offer notification types
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered'
  )
);

-- Verify the new constraint
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public' 
  AND constraint_name = 'notifications_type_check';

SELECT '✅ Notification types updated successfully!' AS status;













