-- =====================================================
-- TUTOR SESSION CANCELLATION
-- =====================================================
-- Allows tutors to cancel upcoming sessions with reason
-- and optional reschedule request

-- 1. Add cancellation tracking fields to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('tutor', 'student', 'admin')),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reschedule_proposed_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reschedule_proposed_end TIMESTAMPTZ;

-- 2. Update session status constraint to include CANCELLED
DO $$
BEGIN
    -- Check if CANCELLED is already in the constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'sessions'
        AND con.conname = 'sessions_status_check'
        AND pg_get_constraintdef(con.oid) LIKE '%CANCELLED%'
    ) THEN
        -- Drop and recreate the constraint
        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
        
        ALTER TABLE sessions
        ADD CONSTRAINT sessions_status_check
        CHECK (status IN (
            'SCHEDULED',
            'JOIN_OPEN',
            'COMPLETED_ASSUMED',
            'NO_SHOW_STUDENT',
            'EARLY_END_SHORT',
            'CANCELLED'
        ));
    END IF;
END $$;

-- 3. Create tutor_cancel_session function
CREATE OR REPLACE FUNCTION tutor_cancel_session(
    p_session_id UUID,
    p_cancellation_reason TEXT,
    p_reschedule_start TIMESTAMPTZ DEFAULT NULL,
    p_reschedule_end TIMESTAMPTZ DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_session RECORD;
    v_booking RECORD;
    v_tutor_name TEXT;
BEGIN
    -- Get session details
    SELECT * INTO v_session
    FROM sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    -- Verify tutor owns this session
    IF v_session.tutor_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the tutor can cancel this session';
    END IF;

    -- Validate session can be cancelled (must be upcoming)
    IF v_session.status NOT IN ('SCHEDULED', 'JOIN_OPEN') THEN
        RAISE EXCEPTION 'Cannot cancel session with status: %', v_session.status;
    END IF;

    -- Validate not too close to start time (must be at least 2 hours before)
    IF v_session.scheduled_start_at - INTERVAL '2 hours' < NOW() THEN
        RAISE EXCEPTION 'Cannot cancel session less than 2 hours before start time';
    END IF;

    -- Validate cancellation reason provided
    IF p_cancellation_reason IS NULL OR TRIM(p_cancellation_reason) = '' THEN
        RAISE EXCEPTION 'Cancellation reason is required';
    END IF;

    -- Validate reschedule times if provided
    IF p_reschedule_start IS NOT NULL AND p_reschedule_end IS NOT NULL THEN
        IF p_reschedule_end <= p_reschedule_start THEN
            RAISE EXCEPTION 'Reschedule end time must be after start time';
        END IF;
        
        IF p_reschedule_start < NOW() THEN
            RAISE EXCEPTION 'Reschedule time cannot be in the past';
        END IF;
    END IF;

    -- Update session status
    UPDATE sessions
    SET
        status = 'CANCELLED',
        cancelled_by = 'tutor',
        cancellation_reason = p_cancellation_reason,
        cancelled_at = NOW(),
        reschedule_proposed_start = p_reschedule_start,
        reschedule_proposed_end = p_reschedule_end,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Get booking details for notification
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = v_session.booking_id;

    -- Get tutor name
    SELECT COALESCE(display_name, full_name, username) INTO v_tutor_name
    FROM profiles
    WHERE id = v_session.tutor_id;

    -- Notify student
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        created_at,
        metadata
    ) VALUES (
        v_session.student_id,
        'session_cancelled',
        'Session Cancelled',
        v_tutor_name || ' has cancelled your upcoming session. Reason: ' || p_cancellation_reason,
        '/student/sessions',
        NOW(),
        jsonb_build_object(
            'session_id', p_session_id,
            'booking_id', v_session.booking_id,
            'cancelled_by', 'tutor',
            'has_reschedule_request', p_reschedule_start IS NOT NULL
        )
    );

    -- If reschedule requested, add additional notification
    IF p_reschedule_start IS NOT NULL THEN
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            link,
            created_at,
            metadata
        ) VALUES (
            v_session.student_id,
            'reschedule_request',
            'Reschedule Request',
            v_tutor_name || ' has proposed a new time for your session',
            '/student/sessions',
            NOW(),
            jsonb_build_object(
                'session_id', p_session_id,
                'booking_id', v_session.booking_id,
                'proposed_start', p_reschedule_start,
                'proposed_end', p_reschedule_end
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Session cancelled successfully',
        'session_id', p_session_id,
        'reschedule_requested', p_reschedule_start IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_cancel_session TO authenticated;

SELECT '✅ Tutor session cancellation feature installed' AS status;
