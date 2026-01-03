-- =====================================================
-- FIX NOTIFICATIONS TYPE CHECK CONSTRAINT (SAFE VERSION)
-- =====================================================
-- First checks existing types, then updates constraint

-- Step 1: Check what notification types currently exist in the table
SELECT 
  type,
  COUNT(*) as count
FROM public.notifications
GROUP BY type
ORDER BY count DESC;

-- Step 2: Drop the old constraint
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Step 3: Create new constraint that includes ALL existing types plus lesson offer types
-- Add any types you see in Step 1 results to this list!
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    -- Common notification types (add more if you see them in Step 1)
    'booking_request',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_updated',
    'message_received',
    'message_sent',
    'payment_received',
    'payment_sent',
    'rating_received',
    'rating_given',
    'session_reminder',
    'new_message',
    -- Lesson offer notification types
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered'
  )
);

-- Step 4: Verify the new constraint
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public' 
  AND constraint_name = 'notifications_type_check';

SELECT '✅ Notification types updated successfully!' AS status;

-- Step 5: Verify all existing rows are now valid
-- (This should return no rows if everything is good)
SELECT 
  id,
  type,
  title,
  created_at
FROM public.notifications
WHERE type NOT IN (
    'booking_request',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_updated',
    'message_received',
    'message_sent',
    'payment_received',
    'payment_sent',
    'rating_received',
    'rating_given',
    'session_reminder',
    'new_message',
    'lesson_offer_received',
    'lesson_offer_accepted',
    'lesson_offer_declined',
    'lesson_offer_countered'
)
LIMIT 10;






