-- =====================================================
-- FLEXIBLE BOOKING: Return availability windows instead of fixed slots
-- Allows students to book at any 15-minute interval within tutor's availability
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
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Set minimum notice requirement
    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';  -- Same-day: Just needs to be in future
    ELSE
        v_minimum_notice := interval '24 hours'; -- Requires 24h advance notice
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
            -- Interpret times in local timezone
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            -- Handle midnight edge case
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
    -- Get busy periods (confirmed bookings + unavailability blocks)
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
    -- Filter windows: Only keep future slots with minimum notice
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end >= now() + v_minimum_notice
        -- Adjust start time if it's in the past or too soon
        AND window_start < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', GREATEST(window_start, now() + v_minimum_notice),
            'end_at', window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    -- Build busy blocks
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return result with availability windows and busy blocks
    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb),
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- Add helper function to validate if a requested time fits within availability
CREATE OR REPLACE FUNCTION is_time_slot_available(
    p_tutor_id uuid,
    p_requested_start timestamptz,
    p_requested_end timestamptz
) RETURNS boolean AS $$
DECLARE
    v_calendar jsonb;
    v_window jsonb;
    v_busy jsonb;
    v_window_start timestamptz;
    v_window_end timestamptz;
    v_busy_start timestamptz;
    v_busy_end timestamptz;
    v_fits_in_window boolean := false;
    v_overlaps_busy boolean := false;
BEGIN
    -- Get calendar data
    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start, p_requested_end);
    
    -- Check if requested time fits within any availability window
    FOR v_window IN SELECT * FROM jsonb_array_elements(v_calendar->'availability_windows')
    LOOP
        v_window_start := (v_window->>'start_at')::timestamptz;
        v_window_end := (v_window->>'end_at')::timestamptz;
        
        IF p_requested_start >= v_window_start AND p_requested_end <= v_window_end THEN
            v_fits_in_window := true;
            EXIT;
        END IF;
    END LOOP;
    
    -- If doesn't fit in any window, not available
    IF NOT v_fits_in_window THEN
        RETURN false;
    END IF;
    
    -- Check if requested time overlaps with any busy block
    FOR v_busy IN SELECT * FROM jsonb_array_elements(v_calendar->'busy_blocks')
    LOOP
        v_busy_start := (v_busy->>'start_at')::timestamptz;
        v_busy_end := (v_busy->>'end_at')::timestamptz;
        
        IF time_ranges_overlap(p_requested_start, p_requested_end, v_busy_start, v_busy_end) THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_time_slot_available TO authenticated;

-- Verification: Test the new function
SELECT 
    'Migration 074 completed' as status,
    'get_tutor_public_calendar updated for flexible bookings' as message;
