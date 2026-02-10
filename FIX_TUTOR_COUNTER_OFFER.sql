-- =====================================================
-- FIX TUTOR COUNTER OFFER FUNCTION
-- Resolves the status check constraint violation
-- =====================================================

-- Drop and recreate the function to ensure it's correct
DROP FUNCTION IF EXISTS tutor_counter_offer(uuid, timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION tutor_counter_offer(
    p_booking_id uuid,
    p_proposed_start_at timestamptz,
    p_proposed_end_at timestamptz,
    p_message text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_message_id uuid;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND tutor_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    -- Validate proposed time is available using calendar
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            p_proposed_start_at,
            p_proposed_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Proposed time slot is not available';
    END IF;

    -- Insert time proposal message
    INSERT INTO public.booking_messages (
        booking_id,
        sender_id,
        message_type,
        body,
        proposed_start_at,
        proposed_end_at
    ) VALUES (
        p_booking_id,
        auth.uid(),
        'time_proposal',
        COALESCE(p_message, 'Alternative time proposed'),
        p_proposed_start_at,
        p_proposed_end_at
    ) RETURNING id INTO v_message_id;

    -- Update booking status (explicitly cast to text to ensure proper type)
    UPDATE public.bookings
    SET 
        status = 'COUNTER_PROPOSED'::text,
        last_action_by = 'tutor'::text
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'COUNTER_PROPOSED',
        'message_id', v_message_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_counter_offer TO authenticated;

-- Verify the function was created
SELECT 'Function tutor_counter_offer recreated successfully' AS status;
