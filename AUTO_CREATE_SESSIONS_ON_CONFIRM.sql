-- =====================================================
-- AUTO-CREATE SESSIONS WHEN BOOKING IS CONFIRMED
-- =====================================================
-- This trigger automatically creates a session when a booking is confirmed

-- Trigger function to create session when booking is confirmed
CREATE OR REPLACE FUNCTION auto_create_session_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
    v_provider TEXT;
    v_duration_minutes INTEGER;
    v_no_show_wait INTEGER;
    v_min_payable INTEGER;
    v_platform_fee_pct INTEGER;
    v_platform_fee NUMERIC;
    v_payout NUMERIC;
BEGIN
    -- Only act when status changes to CONFIRMED
    IF NEW.status = 'CONFIRMED' AND (OLD.status IS NULL OR OLD.status != 'CONFIRMED') THEN
        
        -- Check if session already exists
        IF EXISTS (SELECT 1 FROM sessions WHERE booking_id = NEW.id) THEN
            RAISE NOTICE 'Session already exists for booking %', NEW.id;
            RETURN NEW;
        END IF;

        -- Ensure confirmed times are set
        IF NEW.confirmed_start_at IS NULL OR NEW.confirmed_end_at IS NULL THEN
            RAISE WARNING 'Booking % confirmed but missing confirmed times', NEW.id;
            RETURN NEW;
        END IF;

        -- Get tutor's video provider (default to google_meet if not connected)
        SELECT provider INTO v_provider
        FROM tutor_video_provider_connections
        WHERE tutor_id = NEW.tutor_id
            AND is_active = true
            AND connection_status = 'connected'
        LIMIT 1;

        IF v_provider IS NULL THEN
            -- Default to google_meet if no provider is connected
            v_provider := 'google_meet';
            RAISE NOTICE 'No video provider connected for tutor %, defaulting to google_meet', NEW.tutor_id;
        END IF;

        -- Calculate duration in minutes
        v_duration_minutes := EXTRACT(EPOCH FROM (NEW.confirmed_end_at - NEW.confirmed_start_at)) / 60;

        -- Calculate session rules (33% for no-show wait, 66% for min payable)
        v_no_show_wait := FLOOR(v_duration_minutes * 0.33);
        v_min_payable := FLOOR(v_duration_minutes * 0.66);

        -- Calculate platform fee using tiered structure
        IF NEW.price_ttd < 50 THEN
            v_platform_fee_pct := 10;
        ELSIF NEW.price_ttd >= 50 AND NEW.price_ttd < 200 THEN
            v_platform_fee_pct := 15;
        ELSE
            v_platform_fee_pct := 20;
        END IF;

        v_platform_fee := ROUND(NEW.price_ttd * v_platform_fee_pct / 100.0, 2);
        v_payout := NEW.price_ttd - v_platform_fee;

        -- Insert session
        BEGIN
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
                NEW.id,
                NEW.tutor_id,
                NEW.student_id,
                v_provider,
                NEW.confirmed_start_at,
                NEW.confirmed_end_at,
                v_duration_minutes,
                v_no_show_wait,
                v_min_payable,
                NEW.confirmed_end_at,
                NEW.price_ttd,
                v_payout,
                v_platform_fee,
                'SCHEDULED',
                NOW(),
                NOW()
            );

            RAISE NOTICE 'Auto-created session for booking %', NEW.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to auto-create session for booking %: %', NEW.id, SQLERRM;
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

-- Test by confirming an existing booking (uncomment to test)
-- UPDATE bookings SET status = 'CONFIRMED' WHERE id = '<booking-id>';

SELECT '✅ Trigger created: Sessions will be automatically created when bookings are confirmed' AS status;
