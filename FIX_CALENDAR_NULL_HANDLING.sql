-- =====================================================
-- FIX: Handle NULL values in calendar function properly
-- This ensures busy_blocks and availability_windows are always arrays, never NULL
-- =====================================================

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
    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Set minimum notice requirement
    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';
    ELSE
        v_minimum_notice := interval '24 hours';
    END IF;

    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build availability windows from tutor's availability rules
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
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end >= now() + v_minimum_notice
        AND window_start < window_end
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'start_at', GREATEST(window_start, now() + v_minimum_notice),
                'end_at', window_end
            )
            ORDER BY window_start
        ),
        '[]'::jsonb
    ) INTO v_availability_windows
    FROM future_windows;

    -- Build busy blocks with COALESCE to handle empty results
    WITH busy_periods AS (
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
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'start_at', busy_start,
                'end_at', busy_end,
                'type', busy_type
            )
            ORDER BY busy_start
        ),
        '[]'::jsonb
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return result with availability windows and busy blocks
    v_result := jsonb_build_object(
        'availability_windows', v_availability_windows,
        'busy_blocks', v_busy_blocks,
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the fix
SELECT 'Function updated with proper NULL handling' as status;
