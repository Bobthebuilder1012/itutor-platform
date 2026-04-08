-- =====================================================
-- UPDATE CANCEL BOOKING FUNCTIONS TO UPDATE SESSIONS
-- =====================================================
-- When a booking is cancelled, also mark the corresponding session as CANCELLED

CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    -- Verify student owns this booking
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update booking status
    UPDATE public.bookings
    SET 
        status = 'CANCELLED',
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Update session status if a session exists for this booking
    UPDATE public.sessions
    SET 
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- Add message if provided
    IF p_reason IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
