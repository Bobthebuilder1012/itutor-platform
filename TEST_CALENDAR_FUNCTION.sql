-- =====================================================
-- TEST: Check what get_tutor_public_calendar returns
-- =====================================================

-- First, let's see if the function exists and its signature
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_tutor_public_calendar';

-- Get a tutor ID to test with
SELECT 
    id,
    full_name,
    username
FROM profiles
WHERE role = 'tutor'
LIMIT 5;

-- Test the function with a sample tutor
-- Replace the UUID below with an actual tutor ID from your database
-- For now using a placeholder
DO $$
DECLARE
    v_test_tutor_id uuid;
    v_result jsonb;
BEGIN
    -- Get first tutor
    SELECT id INTO v_test_tutor_id
    FROM profiles
    WHERE role = 'tutor'
    LIMIT 1;
    
    IF v_test_tutor_id IS NOT NULL THEN
        RAISE NOTICE 'Testing with tutor ID: %', v_test_tutor_id;
        
        -- Call the function
        v_result := get_tutor_public_calendar(
            v_test_tutor_id,
            NOW(),
            NOW() + interval '7 days'
        );
        
        -- Display result structure
        RAISE NOTICE 'Result keys: %', jsonb_object_keys(v_result);
        RAISE NOTICE 'Full result: %', v_result;
        
        -- Check specific fields
        RAISE NOTICE 'Has availability_windows: %', (v_result ? 'availability_windows');
        RAISE NOTICE 'Has available_slots: %', (v_result ? 'available_slots');
        RAISE NOTICE 'Has busy_blocks: %', (v_result ? 'busy_blocks');
        RAISE NOTICE 'Has allows_flexible_booking: %', (v_result ? 'allows_flexible_booking');
        
        -- Show counts
        IF v_result ? 'availability_windows' THEN
            RAISE NOTICE 'Availability windows count: %', jsonb_array_length(v_result->'availability_windows');
        END IF;
        
        IF v_result ? 'busy_blocks' THEN
            RAISE NOTICE 'Busy blocks count: %', jsonb_array_length(v_result->'busy_blocks');
        END IF;
    ELSE
        RAISE NOTICE 'No tutors found in database';
    END IF;
END $$;
