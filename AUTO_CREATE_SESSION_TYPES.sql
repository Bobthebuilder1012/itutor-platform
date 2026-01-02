-- =====================================================
-- AUTO-CREATE SESSION TYPES FOR ALL TUTORS
-- This creates default session types for booking
-- =====================================================

-- 1) Create default session types for all existing tutor-subject combinations
INSERT INTO public.session_types (
    tutor_id,
    subject_id,
    name,
    duration_minutes,
    price_ttd,
    is_active
)
SELECT 
    ts.tutor_id,
    ts.subject_id,
    'Standard Session' as name,
    60 as duration_minutes, -- Default 1 hour
    ts.price_per_hour_ttd as price_ttd,
    true as is_active
FROM public.tutor_subjects ts
WHERE NOT EXISTS (
    -- Don't create duplicates
    SELECT 1 FROM public.session_types st
    WHERE st.tutor_id = ts.tutor_id
    AND st.subject_id = ts.subject_id
);

-- 2) Show what was created
DO $$
DECLARE
    v_count int;
    v_st record;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.session_types;
    RAISE NOTICE '✓ Session types created! Total session types: %', v_count;
    
    -- Show a sample
    RAISE NOTICE '';
    RAISE NOTICE 'Sample session types:';
    FOR v_st IN 
        SELECT 
            COALESCE(p.username, p.full_name) as tutor,
            s.name as subject,
            st.duration_minutes,
            st.price_ttd
        FROM public.session_types st
        JOIN public.profiles p ON p.id = st.tutor_id
        JOIN public.subjects s ON s.id = st.subject_id
        LIMIT 5
    LOOP
        RAISE NOTICE '  - % teaching %: % min @ $% TTD', 
            v_st.tutor, v_st.subject, v_st.duration_minutes, v_st.price_ttd;
    END LOOP;
END $$;

-- 3) Create a function to auto-create session types when tutors add subjects
CREATE OR REPLACE FUNCTION auto_create_session_type()
RETURNS TRIGGER AS $$
BEGIN
    -- When a tutor adds a subject, automatically create a default session type
    INSERT INTO public.session_types (
        tutor_id,
        subject_id,
        name,
        duration_minutes,
        price_ttd,
        is_active
    ) VALUES (
        NEW.tutor_id,
        NEW.subject_id,
        'Standard Session',
        60, -- Default 1 hour
        NEW.price_per_hour_ttd,
        true
    )
    ON CONFLICT DO NOTHING; -- In case one already exists
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Create trigger on tutor_subjects
DROP TRIGGER IF EXISTS trigger_auto_create_session_type ON public.tutor_subjects;
CREATE TRIGGER trigger_auto_create_session_type
    AFTER INSERT ON public.tutor_subjects
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_session_type();

-- 5) Add RLS policies for session_types if they don't exist
DO $$
DECLARE
    v_policy_count int;
BEGIN
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'session_types';
    
    IF v_policy_count = 0 THEN
        ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;
        
        -- Tutors can manage their own session types
        CREATE POLICY "Tutors can manage their session types"
        ON public.session_types
        FOR ALL
        TO authenticated
        USING (tutor_id = auth.uid())
        WITH CHECK (tutor_id = auth.uid());
        
        -- Anyone can view session types (needed for booking)
        CREATE POLICY "Anyone can view session types"
        ON public.session_types
        FOR SELECT
        TO authenticated
        USING (true);
        
        RAISE NOTICE '✓ Created RLS policies for session_types';
    ELSE
        RAISE NOTICE '✓ RLS policies already exist for session_types (% policies)', v_policy_count;
    END IF;
END $$;

-- 6) Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  SESSION TYPES AUTO-CREATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Default session types created for all tutors';
    RAISE NOTICE '✓ Trigger installed to auto-create future session types';
    RAISE NOTICE '✓ RLS policies configured';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Restart your Next.js dev server';
    RAISE NOTICE '2. Hard refresh browser (Ctrl+Shift+R)';
    RAISE NOTICE '3. Try booking a session again';
    RAISE NOTICE '';
END $$;

