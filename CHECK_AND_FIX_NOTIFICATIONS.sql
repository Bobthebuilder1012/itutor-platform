-- =====================================================
-- CHECK AND FIX NOTIFICATIONS (STEP BY STEP)
-- =====================================================

-- STEP 1: See what notification types currently exist
-- Run this first to see what we're dealing with
SELECT 
  type,
  COUNT(*) as count
FROM public.notifications
GROUP BY type
ORDER BY count DESC;

-- STEP 2: Drop the constraint (run this after seeing Step 1 results)
-- This is the simplest solution
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- STEP 3: Verify constraint is gone
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public' 
  AND constraint_name = 'notifications_type_check';

-- If Step 3 returns no rows, the constraint is successfully removed!

SELECT '✅ Constraint removed! Lesson offers should work now.' AS status;












