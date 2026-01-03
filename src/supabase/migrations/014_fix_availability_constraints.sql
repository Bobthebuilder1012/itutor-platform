-- =====================================================
-- FIX AVAILABILITY CONSTRAINTS
-- Remove midnight-spanning constraint and ensure proper validation
-- =====================================================

-- 1) Remove the check constraint that prevents overnight sessions
ALTER TABLE public.tutor_availability_rules
DROP CONSTRAINT IF EXISTS tutor_availability_rules_end_time_check;

-- Note: We no longer enforce end_time > start_time at the database level
-- because tutors may want to teach overnight (e.g., 10:45 PM to 5:00 AM)
-- The application logic should handle this properly by treating such sessions
-- as spanning two calendar days.

-- 2) Verify the tables are set up correctly
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.tutor_availability_rules'::regclass
AND conname LIKE '%check%';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Availability constraints updated successfully. Overnight sessions are now allowed.';
END
$$;








