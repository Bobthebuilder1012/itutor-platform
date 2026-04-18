ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.bookings
    SET
        status = 'CANCELLED',
        last_action_by = 'student',
        cancellation_reason = NULLIF(TRIM(COALESCE(p_reason, '')), '')
    WHERE id = p_booking_id;

    UPDATE public.sessions
    SET
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    IF p_reason IS NOT NULL AND TRIM(p_reason) <> '' THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
