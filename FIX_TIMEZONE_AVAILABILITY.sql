-- Fix timezone issue in get_tutor_public_calendar
-- The problem: when adding TIME to DATE, PostgreSQL treats result as UTC
-- The fix: explicitly set timezone to user's local timezone (or use AT TIME ZONE)

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_available_slots jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build available slots from availability rules
    -- For MVP: generate all slots, then filter out busy ones
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    availability_windows AS (
        SELECT 
            -- Fix: interpret times in local timezone, not UTC
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            ((ds.day || ' ' || ar.end_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end,
            ar.slot_minutes,
            ar.buffer_minutes
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
    ),
    -- Filter windows to be within range
    filtered_windows AS (
        SELECT * FROM availability_windows
        WHERE window_start >= p_range_start
        AND window_end <= p_range_end
    ),
    generated_slots AS (
        SELECT 
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') as slot_start,
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') + (slot_minutes * interval '1 minute') as slot_end
        FROM filtered_windows,
        LATERAL generate_series(
            0,
            FLOOR(EXTRACT(EPOCH FROM (window_end - window_start)) / 60 / (slot_minutes + buffer_minutes))::int - 1
        ) as n
    ),
    -- Get all busy periods (confirmed bookings + unavailability blocks)
    busy_periods AS (
        -- Confirmed bookings
        SELECT confirmed_start_at as start_at, confirmed_end_at as end_at
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at < p_range_end
        AND confirmed_end_at > p_range_start
        
        UNION ALL
        
        -- Unavailability blocks
        SELECT start_at, end_at
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND start_at < p_range_end
        AND end_at > p_range_start
    ),
    -- Identify available vs busy slots
    slot_availability AS (
        SELECT 
            gs.slot_start,
            gs.slot_end,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM busy_periods bp
                    WHERE gs.slot_start < bp.end_at 
                    AND gs.slot_end > bp.start_at
                ) THEN false
                ELSE true
            END as is_available
        FROM generated_slots gs
        WHERE gs.slot_start >= NOW() -- only future slots
    )
    SELECT 
        jsonb_agg(
            jsonb_build_object(
                'start_at', slot_start,
                'end_at', slot_end
            )
        ) FILTER (WHERE is_available)
    INTO v_available_slots
    FROM slot_availability;

    -- Get busy blocks
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', start_at,
            'end_at', end_at,
            'type', 
                CASE 
                    WHEN start_at IN (
                        SELECT confirmed_start_at FROM public.bookings 
                        WHERE tutor_id = p_tutor_id AND status = 'CONFIRMED'
                    ) THEN 'BOOKED'
                    ELSE 'UNAVAILABLE'
                END
        )
    )
    INTO v_busy_blocks
    FROM busy_periods;

    RETURN jsonb_build_object(
        'available_slots', COALESCE(v_available_slots, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;
