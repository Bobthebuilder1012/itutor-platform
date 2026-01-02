-- =====================================================
-- TEST CALENDAR SYSTEM - DEBUGGING SCRIPT
-- Run this to test if the calendar is working correctly
-- =====================================================

-- 1) Find a tutor to test with
DO $$
DECLARE
    v_tutor_id uuid;
    v_tutor_name text;
BEGIN
    SELECT id, COALESCE(display_name, username, full_name) 
    INTO v_tutor_id, v_tutor_name
    FROM public.profiles
    WHERE role = 'tutor'
    LIMIT 1;
    
    IF v_tutor_id IS NULL THEN
        RAISE NOTICE '❌ No tutors found in the system.';
        RAISE NOTICE '   Create a tutor account first.';
        RETURN;
    END IF;
    
    RAISE NOTICE '✓ Testing with tutor: % (ID: %)', v_tutor_name, v_tutor_id;
    
    -- Store for next steps
    CREATE TEMP TABLE IF NOT EXISTS test_context (tutor_id uuid, tutor_name text);
    DELETE FROM test_context;
    INSERT INTO test_context VALUES (v_tutor_id, v_tutor_name);
END $$;

-- 2) Check if tutor has any availability rules
DO $$
DECLARE
    v_tutor_id uuid;
    v_rule_count int;
    v_rule record;
BEGIN
    SELECT tutor_id INTO v_tutor_id FROM test_context;
    
    SELECT COUNT(*) INTO v_rule_count
    FROM public.tutor_availability_rules
    WHERE tutor_id = v_tutor_id AND is_active = true;
    
    IF v_rule_count = 0 THEN
        RAISE NOTICE '⚠ Tutor has NO availability rules set.';
        RAISE NOTICE '   Add teaching hours in the Tutor Availability page first.';
    ELSE
        RAISE NOTICE '✓ Tutor has % availability rule(s):', v_rule_count;
        
        -- Show the rules
        FOR v_rule IN 
            SELECT 
                CASE day_of_week
                    WHEN 0 THEN 'Sunday'
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END as day_name,
                start_time::text as start_time,
                end_time::text as end_time,
                slot_minutes
            FROM public.tutor_availability_rules
            WHERE tutor_id = v_tutor_id AND is_active = true
        LOOP
            RAISE NOTICE '   - %: % to % (% min slots)', 
                v_rule.day_name, v_rule.start_time, v_rule.end_time, v_rule.slot_minutes;
        END LOOP;
    END IF;
END $$;

-- 3) Check for unavailability blocks
DO $$
DECLARE
    v_tutor_id uuid;
    v_block_count int;
    v_block record;
BEGIN
    SELECT tutor_id INTO v_tutor_id FROM test_context;
    
    SELECT COUNT(*) INTO v_block_count
    FROM public.tutor_unavailability_blocks
    WHERE tutor_id = v_tutor_id
    AND end_at > NOW();
    
    IF v_block_count = 0 THEN
        RAISE NOTICE '✓ Tutor has no unavailability blocks (all times potentially available).';
    ELSE
        RAISE NOTICE '⚠ Tutor has % unavailability block(s):', v_block_count;
        
        FOR v_block IN
            SELECT 
                start_at::text as start_at,
                end_at::text as end_at,
                COALESCE(reason_private, '(no reason)') as reason
            FROM public.tutor_unavailability_blocks
            WHERE tutor_id = v_tutor_id
            AND end_at > NOW()
            ORDER BY start_at
            LIMIT 5
        LOOP
            RAISE NOTICE '   - % to % (%)', 
                v_block.start_at, v_block.end_at, v_block.reason;
        END LOOP;
    END IF;
END $$;

-- 4) Check for confirmed bookings
DO $$
DECLARE
    v_tutor_id uuid;
    v_booking_count int;
    v_booking record;
BEGIN
    SELECT tutor_id INTO v_tutor_id FROM test_context;
    
    SELECT COUNT(*) INTO v_booking_count
    FROM public.bookings
    WHERE tutor_id = v_tutor_id
    AND status = 'CONFIRMED'
    AND confirmed_end_at > NOW();
    
    IF v_booking_count = 0 THEN
        RAISE NOTICE '✓ Tutor has no confirmed bookings (all available slots are free).';
    ELSE
        RAISE NOTICE '⚠ Tutor has % confirmed booking(s) that will block slots:', v_booking_count;
        
        FOR v_booking IN
            SELECT 
                confirmed_start_at::text as confirmed_start_at,
                confirmed_end_at::text as confirmed_end_at
            FROM public.bookings
            WHERE tutor_id = v_tutor_id
            AND status = 'CONFIRMED'
            AND confirmed_end_at > NOW()
            ORDER BY confirmed_start_at
            LIMIT 5
        LOOP
            RAISE NOTICE '   - % to %', 
                v_booking.confirmed_start_at, v_booking.confirmed_end_at;
        END LOOP;
    END IF;
END $$;

-- 5) Test the get_tutor_public_calendar function
DO $$
DECLARE
    v_tutor_id uuid;
    v_tutor_name text;
    v_calendar jsonb;
    v_available_count int;
    v_busy_count int;
    v_slot record;
BEGIN
    SELECT tutor_id, tutor_name INTO v_tutor_id, v_tutor_name FROM test_context;
    
    RAISE NOTICE '';
    RAISE NOTICE '=====================================';
    RAISE NOTICE 'Testing get_tutor_public_calendar()';
    RAISE NOTICE '=====================================';
    
    -- Call the function for next 7 days
    BEGIN
        v_calendar := get_tutor_public_calendar(
            v_tutor_id,
            NOW(),
            NOW() + INTERVAL '7 days'
        );
        
        v_available_count := jsonb_array_length(v_calendar->'available_slots');
        v_busy_count := jsonb_array_length(v_calendar->'busy_blocks');
        
        RAISE NOTICE '✓ Function executed successfully!';
        RAISE NOTICE '   Available slots: %', v_available_count;
        RAISE NOTICE '   Busy blocks: %', v_busy_count;
        
        IF v_available_count = 0 AND v_busy_count = 0 THEN
            RAISE NOTICE '⚠ No slots returned. Possible reasons:';
            RAISE NOTICE '   1. Tutor has not set any availability rules';
            RAISE NOTICE '   2. All slots are in the past';
            RAISE NOTICE '   3. Current time is outside teaching hours';
        ELSIF v_available_count > 0 THEN
            RAISE NOTICE '';
            RAISE NOTICE '✓ Sample available slots (showing first 3):';
            FOR v_slot IN
                SELECT 
                    value->>'start_at' as start_at,
                    value->>'end_at' as end_at
                FROM jsonb_array_elements(v_calendar->'available_slots')
                LIMIT 3
            LOOP
                RAISE NOTICE '   - % to %', v_slot.start_at, v_slot.end_at;
            END LOOP;
        END IF;
        
        IF v_busy_count > 0 THEN
            RAISE NOTICE '';
            RAISE NOTICE '✓ Sample busy blocks (showing first 3):';
            FOR v_slot IN
                SELECT 
                    value->>'start_at' as start_at,
                    value->>'end_at' as end_at,
                    value->>'type' as block_type
                FROM jsonb_array_elements(v_calendar->'busy_blocks')
                LIMIT 3
            LOOP
                RAISE NOTICE '   - % to % (%)', v_slot.start_at, v_slot.end_at, v_slot.block_type;
            END LOOP;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '❌ Function failed: %', SQLERRM;
    END;
END $$;

-- 6) Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  CALENDAR SYSTEM TEST COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'If you see available slots above, the calendar should work in the UI.';
    RAISE NOTICE 'If you see 0 available slots:';
    RAISE NOTICE '  1. Add teaching hours in Tutor Dashboard → Availability';
    RAISE NOTICE '  2. Make sure teaching hours include times in the next 7 days';
    RAISE NOTICE '  3. Run this test again';
    RAISE NOTICE '';
END $$;

-- Cleanup
DROP TABLE IF EXISTS test_context;

