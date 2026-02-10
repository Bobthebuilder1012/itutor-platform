-- =====================================================
-- FIX STATUS CONSTRAINT MISMATCH
-- Resolves the conflict between constraint and functions
-- =====================================================

-- The issue: PARENT_APPROVAL_WORKFLOW_COMPLETE.sql changed the constraint
-- to use 'COUNTERED' but the functions still use 'COUNTER_PROPOSED'

-- SOLUTION: Update the constraint to match the original schema
-- which uses 'COUNTER_PROPOSED' (not 'COUNTERED')

-- Drop the incorrect constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add the correct constraint with COUNTER_PROPOSED (not COUNTERED)
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN (
    'PENDING',                    -- Waiting for tutor response (original flow)
    'PENDING_PARENT_APPROVAL',    -- Waiting for parent approval (child accounts)
    'PARENT_APPROVED',            -- Parent approved, now goes to tutor
    'PARENT_REJECTED',            -- Parent rejected the booking request
    'COUNTER_PROPOSED',           -- Tutor counter-proposed (CORRECTED FROM 'COUNTERED')
    'CONFIRMED',                  -- Tutor confirmed
    'DECLINED',                   -- Tutor declined
    'CANCELLED',                  -- Cancelled by either party
    'COMPLETED',                  -- Session completed
    'NO_SHOW'                     -- Student didn't show up
));

-- Verify the constraint was created correctly
SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
INNER JOIN pg_class rel ON rel.oid = con.conrelid
INNER JOIN pg_namespace nsp ON nsp.oid = connamespace
WHERE nsp.nspname = 'public'
    AND rel.relname = 'bookings'
    AND con.conname = 'bookings_status_check';

SELECT 'Status constraint fixed - COUNTER_PROPOSED is now allowed' AS status;
