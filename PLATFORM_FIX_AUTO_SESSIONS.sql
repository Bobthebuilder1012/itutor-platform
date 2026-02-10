-- =====================================================
-- PLATFORM-WIDE FIX: AUTO-CREATE SESSIONS ON BOOKING CONFIRMATION
-- =====================================================
-- This fixes the issue where sessions aren't created when bookings are confirmed
-- Root cause: Frontend API call can fail, leaving confirmed bookings without sessions
-- Solution: Database trigger ensures sessions are ALWAYS created when booking is confirmed

-- =====================================================
-- STEP 1: CREATE HELPER FUNCTION TO CREATE SESSIONS
-- =====================================================

CREATE OR REPLACE FUNCTION create_session_from_booking_internal(p_booking_id UUID)
RETURNS UUID AS $$
DECLARE
    v_booking RECORD;
    v_session_id UUID;
    v_provider TEXT;
    v_duration_minutes INTEGER;
    v_no_show_wait INTEGER;
    v_min_payable INTEGER;
    v_platform_fee_pct INTEGER;
    v_platform_fee NUMERIC;
    v_payout NUMERIC;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found', p_booking_id;
    END IF;

    -- Check if session already exists
    IF EXISTS (SELECT 1 FROM sessions WHERE booking_id = p_booking_id) THEN
        SELECT id INTO v_session_id FROM sessions WHERE booking_id = p_booking_id;
        RETURN v_session_id;
    END IF;

    -- Ensure confirmed times are set
    IF v_booking.confirmed_start_at IS NULL OR v_booking.confirmed_end_at IS NULL THEN
        RAISE EXCEPTION 'Booking % missing confirmed times', p_booking_id;
    END IF;

    -- Get tutor's video provider (default to google_meet if not connected)
    SELECT provider INTO v_provider
    FROM tutor_video_provider_connections
    WHERE tutor_id = v_booking.tutor_id
        AND is_active = true
        AND connection_status = 'connected'
    LIMIT 1;

    IF v_provider IS NULL THEN
        v_provider := 'google_meet';
    END IF;

    -- Calculate duration in minutes
    v_duration_minutes := EXTRACT(EPOCH FROM (v_booking.confirmed_end_at - v_booking.confirmed_start_at)) / 60;

    -- Calculate session rules
    v_no_show_wait := FLOOR(v_duration_minutes * 0.33);
    v_min_payable := FLOOR(v_duration_minutes * 0.66);

    -- Calculate platform fee using tiered structure
    IF v_booking.price_ttd < 50 THEN
        v_platform_fee_pct := 10;
    ELSIF v_booking.price_ttd >= 50 AND v_booking.price_ttd < 200 THEN
        v_platform_fee_pct := 15;
    ELSE
        v_platform_fee_pct := 20;
    END IF;

    v_platform_fee := ROUND(v_booking.price_ttd * v_platform_fee_pct / 100.0, 2);
    v_payout := v_booking.price_ttd - v_platform_fee;

    -- Insert session
    INSERT INTO sessions (
        booking_id,
        tutor_id,
        student_id,
        provider,
        scheduled_start_at,
        scheduled_end_at,
        duration_minutes,
        no_show_wait_minutes,
        min_payable_minutes,
        charge_scheduled_at,
        charge_amount_ttd,
        payout_amount_ttd,
        platform_fee_ttd,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_booking_id,
        v_booking.tutor_id,
        v_booking.student_id,
        v_provider,
        v_booking.confirmed_start_at,
        v_booking.confirmed_end_at,
        v_duration_minutes,
        v_no_show_wait,
        v_min_payable,
        v_booking.confirmed_end_at,
        v_booking.price_ttd,
        v_payout,
        v_platform_fee,
        'SCHEDULED',
        NOW(),
        NOW()
    ) RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_session_from_booking_internal TO authenticated;
GRANT EXECUTE ON FUNCTION create_session_from_booking_internal TO service_role;

-- =====================================================
-- STEP 2: CREATE TRIGGER TO AUTO-CREATE SESSIONS
-- =====================================================

CREATE OR REPLACE FUNCTION auto_create_session_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
BEGIN
    -- Only act when status changes to CONFIRMED
    IF NEW.status = 'CONFIRMED' AND (OLD IS NULL OR OLD.status != 'CONFIRMED') THEN
        
        -- Ensure confirmed times are set
        IF NEW.confirmed_start_at IS NULL OR NEW.confirmed_end_at IS NULL THEN
            RAISE WARNING 'Booking % confirmed but missing confirmed times', NEW.id;
            RETURN NEW;
        END IF;

        -- Try to create session
        BEGIN
            v_session_id := create_session_from_booking_internal(NEW.id);
            RAISE NOTICE '✅ Auto-created session % for booking %', v_session_id, NEW.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '❌ Failed to auto-create session for booking %: %', NEW.id, SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_create_session_on_confirm ON bookings;

-- Create trigger
CREATE TRIGGER trigger_auto_create_session_on_confirm
    AFTER INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_session_on_confirm();

-- =====================================================
-- STEP 3: BACKFILL EXISTING CONFIRMED BOOKINGS
-- =====================================================

DO $$
DECLARE
    v_booking RECORD;
    v_session_id UUID;
    v_success_count INTEGER := 0;
    v_fail_count INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    -- Count total bookings to process
    SELECT COUNT(*) INTO v_total
    FROM bookings b
    LEFT JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED'
        AND s.id IS NULL;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '🔧 Starting backfill for % confirmed bookings...', v_total;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    IF v_total = 0 THEN
        RAISE NOTICE '✅ No bookings need backfilling - all confirmed bookings have sessions!';
        RETURN;
    END IF;

    -- Process each booking
    FOR v_booking IN 
        SELECT b.id, b.tutor_id, b.student_id, b.confirmed_start_at
        FROM bookings b
        LEFT JOIN sessions s ON s.booking_id = b.id
        WHERE b.status = 'CONFIRMED'
            AND s.id IS NULL
        ORDER BY b.created_at
    LOOP
        BEGIN
            v_session_id := create_session_from_booking_internal(v_booking.id);
            v_success_count := v_success_count + 1;
            RAISE NOTICE '  ✅ [%/%] Created session % for booking %', 
                v_success_count + v_fail_count, v_total, v_session_id, v_booking.id;
        EXCEPTION WHEN OTHERS THEN
            v_fail_count := v_fail_count + 1;
            RAISE WARNING '  ❌ [%/%] Failed for booking %: %', 
                v_success_count + v_fail_count, v_total, v_booking.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Backfill complete:';
    RAISE NOTICE '   • Success: % sessions created', v_success_count;
    IF v_fail_count > 0 THEN
        RAISE NOTICE '   • Failed: % bookings', v_fail_count;
    END IF;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- =====================================================
-- STEP 4: VERIFY FIX
-- =====================================================

-- Count confirmed bookings without sessions (should be 0 now)
SELECT 
    COUNT(*) AS confirmed_bookings_without_sessions,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All confirmed bookings have sessions!'
        ELSE '⚠️ Some confirmed bookings still missing sessions'
    END AS status
FROM bookings b
LEFT JOIN sessions s ON s.booking_id = b.id
WHERE b.status = 'CONFIRMED'
    AND s.id IS NULL;

-- Show summary
SELECT 
    '✅ Platform-wide fix applied successfully!' AS summary,
    'Sessions will now be automatically created when bookings are confirmed' AS note;
