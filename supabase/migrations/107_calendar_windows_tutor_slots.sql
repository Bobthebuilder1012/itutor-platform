-- MYI-202: Availability windows should reflect tutor-defined rule bounds, not clip start to "now".
-- Booking validation still happens client-side and in is_time_slot_available; display uses true window edges.

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_availability_windows jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_allow_same_day boolean;
    v_minimum_notice interval;
    v_timezone text := 'America/Port_of_Spain';
BEGIN
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';
    ELSE
        v_minimum_notice := interval '24 hours';
    END IF;

    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    raw_windows AS (
        SELECT
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            ((ds.day || ' ' ||
                CASE
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz >= p_range_start
        AND ((ds.day || ' ' ||
            CASE
                WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                ELSE ar.end_time
            END
        )::timestamp AT TIME ZONE v_timezone)::timestamptz <= p_range_end
    ),
    busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)

        UNION ALL

        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end > now() + v_minimum_notice
        AND window_start < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', window_start,
            'end_at', window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb),
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;
