-- =====================================================
-- COMPLETE FIX: CREATE SESSIONS FOR CONFIRMED BOOKINGS
-- =====================================================
-- This script does everything needed to fix the missing sessions issue

-- =====================================================
-- STEP 1: DIAGNOSTIC - What's the current state?
-- =====================================================

DO $$
DECLARE
    v_confirmed_count INTEGER;
    v_sessions_count INTEGER;
    v_missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_confirmed_count FROM bookings WHERE status = 'CONFIRMED';
    SELECT COUNT(*) INTO v_sessions_count FROM sessions;
    SELECT COUNT(*) INTO v_missing_count 
    FROM bookings b
    LEFT JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED' AND s.id IS NULL;
    
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 CURRENT STATE:';
    RAISE NOTICE '   • Confirmed bookings: %', v_confirmed_count;
    RAISE NOTICE '   • Total sessions: %', v_sessions_count;
    RAISE NOTICE '   • Missing sessions: %', v_missing_count;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- =====================================================
-- STEP 2: CREATE HELPER FUNCTION (if not exists)
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
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
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

    -- Get tutor's video provider
    SELECT provider INTO v_provider
    FROM tutor_video_provider_connections
    WHERE tutor_id = v_booking.tutor_id
        AND is_active = true
        AND connection_status = 'connected'
    LIMIT 1;

    IF v_provider IS NULL THEN
        v_provider := 'google_meet';
    END IF;

    -- Calculate duration
    v_duration_minutes := EXTRACT(EPOCH FROM (v_booking.confirmed_end_at - v_booking.confirmed_start_at)) / 60;
    v_no_show_wait := FLOOR(v_duration_minutes * 0.33);
    v_min_payable := FLOOR(v_duration_minutes * 0.66);

    -- Calculate fees
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
        booking_id, tutor_id, student_id, provider,
        scheduled_start_at, scheduled_end_at, duration_minutes,
        no_show_wait_minutes, min_payable_minutes, charge_scheduled_at,
        charge_amount_ttd, payout_amount_ttd, platform_fee_ttd,
        status, created_at, updated_at
    ) VALUES (
        p_booking_id, v_booking.tutor_id, v_booking.student_id, v_provider,
        v_booking.confirmed_start_at, v_booking.confirmed_end_at, v_duration_minutes,
        v_no_show_wait, v_min_payable, v_booking.confirmed_end_at,
        v_booking.price_ttd, v_payout, v_platform_fee,
        'SCHEDULED', NOW(), NOW()
    ) RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_session_from_booking_internal TO authenticated;
GRANT EXECUTE ON FUNCTION create_session_from_booking_internal TO service_role;

-- =====================================================
-- STEP 3: FIX ANY BOOKINGS MISSING CONFIRMED TIMES
-- =====================================================

DO $$
DECLARE
    v_fixed INTEGER;
BEGIN
    UPDATE bookings
    SET confirmed_start_at = requested_start_at,
        confirmed_end_at = requested_end_at
    WHERE status = 'CONFIRMED'
        AND (confirmed_start_at IS NULL OR confirmed_end_at IS NULL);
    
    GET DIAGNOSTICS v_fixed = ROW_COUNT;
    
    IF v_fixed > 0 THEN
        RAISE NOTICE '🔧 Fixed % bookings with missing confirmed times', v_fixed;
    END IF;
END $$;

-- =====================================================
-- STEP 4: CREATE SESSIONS FOR ALL CONFIRMED BOOKINGS
-- =====================================================

DO $$
DECLARE
    v_booking RECORD;
    v_session_id UUID;
    v_success INTEGER := 0;
    v_failed INTEGER := 0;
    v_total INTEGER;
BEGIN
    -- Count bookings to process
    SELECT COUNT(*) INTO v_total
    FROM bookings b
    LEFT JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED' AND s.id IS NULL;

    IF v_total = 0 THEN
        RAISE NOTICE '✅ No bookings need sessions - all confirmed bookings already have sessions!';
        RETURN;
    END IF;

    RAISE NOTICE '🔄 Creating sessions for % confirmed bookings...', v_total;
    
    FOR v_booking IN 
        SELECT b.id, b.tutor_id, b.student_id
        FROM bookings b
        LEFT JOIN sessions s ON s.booking_id = b.id
        WHERE b.status = 'CONFIRMED' AND s.id IS NULL
        ORDER BY b.created_at
    LOOP
        BEGIN
            v_session_id := create_session_from_booking_internal(v_booking.id);
            v_success := v_success + 1;
            RAISE NOTICE '  ✅ [%/%] Session created for booking %', 
                v_success + v_failed, v_total, v_booking.id;
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            RAISE WARNING '  ❌ [%/%] Failed for booking %: %', 
                v_success + v_failed, v_total, v_booking.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ COMPLETE: Created % sessions', v_success;
    IF v_failed > 0 THEN
        RAISE NOTICE '⚠️  Failed: % bookings', v_failed;
    END IF;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- =====================================================
-- STEP 5: INSTALL TRIGGER FOR FUTURE BOOKINGS
-- =====================================================

CREATE OR REPLACE FUNCTION auto_create_session_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
BEGIN
    IF NEW.status = 'CONFIRMED' AND (OLD IS NULL OR OLD.status != 'CONFIRMED') THEN
        IF NEW.confirmed_start_at IS NULL OR NEW.confirmed_end_at IS NULL THEN
            RAISE WARNING 'Booking % confirmed but missing confirmed times', NEW.id;
            RETURN NEW;
        END IF;

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

DROP TRIGGER IF EXISTS trigger_auto_create_session_on_confirm ON bookings;

CREATE TRIGGER trigger_auto_create_session_on_confirm
    AFTER INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_session_on_confirm();

DO $$
BEGIN
    RAISE NOTICE '✅ Trigger installed - future bookings will auto-create sessions';
END $$;

-- =====================================================
-- STEP 6: FINAL VERIFICATION
-- =====================================================

DO $$
DECLARE
    v_confirmed INTEGER;
    v_with_sessions INTEGER;
    v_missing INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_confirmed FROM bookings WHERE status = 'CONFIRMED';
    
    SELECT COUNT(*) INTO v_with_sessions
    FROM bookings b
    INNER JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED';
    
    SELECT COUNT(*) INTO v_missing
    FROM bookings b
    LEFT JOIN sessions s ON s.booking_id = b.id
    WHERE b.status = 'CONFIRMED' AND s.id IS NULL;
    
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 FINAL STATE:';
    RAISE NOTICE '   • Confirmed bookings: %', v_confirmed;
    RAISE NOTICE '   • With sessions: %', v_with_sessions;
    RAISE NOTICE '   • Still missing: %', v_missing;
    
    IF v_missing = 0 THEN
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE NOTICE '🎉 SUCCESS! All confirmed bookings have sessions!';
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    ELSE
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE WARNING '⚠️  % bookings still missing sessions - check errors above', v_missing;
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    END IF;
END $$;
