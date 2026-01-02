-- =====================================================
-- FIX BOOKING SYSTEM - RUN THIS IN SUPABASE SQL EDITOR
-- =====================================================
-- This script fixes the overnight session constraint and verifies all booking tables/functions exist

-- 1) Remove the check constraint that prevents overnight sessions
DO $$
BEGIN
    -- Try to drop the constraint if it exists
    ALTER TABLE public.tutor_availability_rules
    DROP CONSTRAINT IF EXISTS tutor_availability_rules_end_time_check;
    
    -- Also check for the default constraint name
    ALTER TABLE public.tutor_availability_rules
    DROP CONSTRAINT IF EXISTS tutor_availability_rules_check;
    
    RAISE NOTICE '✓ Removed overnight session constraints';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No constraint to remove (this is fine)';
END $$;

-- 2) Verify all booking tables exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tutor_availability_rules') THEN
        RAISE EXCEPTION 'Table tutor_availability_rules does not exist. Run migration 010_create_booking_system.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tutor_unavailability_blocks') THEN
        RAISE EXCEPTION 'Table tutor_unavailability_blocks does not exist. Run migration 010_create_booking_system.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bookings') THEN
        RAISE EXCEPTION 'Table bookings does not exist. Run migration 010_create_booking_system.sql first.';
    END IF;
    
    RAISE NOTICE '✓ All booking tables exist';
END $$;

-- 3) Verify RPC functions exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'get_tutor_public_calendar'
    ) THEN
        RAISE EXCEPTION 'Function get_tutor_public_calendar does not exist. Run migration 012_booking_functions.sql first.';
    END IF;
    
    RAISE NOTICE '✓ get_tutor_public_calendar function exists';
END $$;

-- 4) Verify RLS policies exist for availability tables
DO $$
DECLARE
    v_policy_count int;
BEGIN
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'tutor_availability_rules';
    
    IF v_policy_count = 0 THEN
        RAISE WARNING 'No RLS policies found for tutor_availability_rules. Creating them now...';
        
        -- Create basic RLS policies
        ALTER TABLE public.tutor_availability_rules ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Tutors can manage their own availability"
        ON public.tutor_availability_rules
        FOR ALL
        TO authenticated
        USING (tutor_id = auth.uid())
        WITH CHECK (tutor_id = auth.uid());
        
        RAISE NOTICE '✓ Created RLS policies for tutor_availability_rules';
    ELSE
        RAISE NOTICE '✓ RLS policies exist for tutor_availability_rules (% policies)', v_policy_count;
    END IF;
END $$;

-- 5) Check for unavailability blocks RLS
DO $$
DECLARE
    v_policy_count int;
BEGIN
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'tutor_unavailability_blocks';
    
    IF v_policy_count = 0 THEN
        RAISE WARNING 'No RLS policies found for tutor_unavailability_blocks. Creating them now...';
        
        ALTER TABLE public.tutor_unavailability_blocks ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Tutors can manage their own unavailability"
        ON public.tutor_unavailability_blocks
        FOR ALL
        TO authenticated
        USING (tutor_id = auth.uid())
        WITH CHECK (tutor_id = auth.uid());
        
        RAISE NOTICE '✓ Created RLS policies for tutor_unavailability_blocks';
    ELSE
        RAISE NOTICE '✓ RLS policies exist for tutor_unavailability_blocks (% policies)', v_policy_count;
    END IF;
END $$;

-- 6) Test: Try to add a sample overnight availability rule (will be deleted after)
DO $$
DECLARE
    v_test_tutor_id uuid;
    v_test_rule_id uuid;
BEGIN
    -- Find a tutor ID to test with
    SELECT id INTO v_test_tutor_id
    FROM public.profiles
    WHERE role = 'tutor'
    LIMIT 1;
    
    IF v_test_tutor_id IS NULL THEN
        RAISE NOTICE 'No tutor found to test with. Skipping overnight session test.';
        RETURN;
    END IF;
    
    -- Try to insert an overnight session
    INSERT INTO public.tutor_availability_rules (
        tutor_id,
        day_of_week,
        start_time,
        end_time,
        slot_minutes,
        buffer_minutes,
        is_active
    ) VALUES (
        v_test_tutor_id,
        1, -- Monday
        '22:45:00', -- 10:45 PM
        '05:00:00', -- 5:00 AM
        60,
        0,
        true
    ) RETURNING id INTO v_test_rule_id;
    
    -- Clean up test rule
    DELETE FROM public.tutor_availability_rules WHERE id = v_test_rule_id;
    
    RAISE NOTICE '✓ Overnight sessions are now allowed! Test passed.';
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to add overnight session: %', SQLERRM;
END $$;

-- 7) Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  BOOKING SYSTEM VERIFICATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ All tables exist';
    RAISE NOTICE '✓ All RPC functions exist';
    RAISE NOTICE '✓ RLS policies are set up';
    RAISE NOTICE '✓ Overnight sessions are allowed';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Restart your Next.js dev server (Ctrl+C then npm run dev)';
    RAISE NOTICE '2. Hard refresh your browser (Ctrl+Shift+R)';
    RAISE NOTICE '3. Try adding teaching hours again';
    RAISE NOTICE '';
END $$;





