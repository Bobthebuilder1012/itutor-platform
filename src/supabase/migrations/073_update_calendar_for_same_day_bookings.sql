-- =====================================================
-- Update get_tutor_public_calendar to respect allow_same_day_bookings flag
-- =====================================================

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_available_slots jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_allow_same_day boolean;
    v_minimum_notice interval;
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, false) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Set minimum notice requirement
    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';  -- Test mode: Show ALL slots (no minimum notice)
    ELSE
        v_minimum_notice := interval '24 hours'; -- Normal: 24 hours notice
    END IF;

    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build available slots from availability rules
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
            -- Special case: if end_time is 00:00:00 (12:00 AM), treat it as 23:59:59 (11:59 PM) same day
            ((ds.day || ' ' || 
                CASE 
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end,
            ar.slot_minutes,
            ar.buffer_minutes
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
    generated_slots AS (
        SELECT 
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') as slot_start,
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') + (slot_minutes * interval '1 minute') as slot_end
        FROM availability_windows,
        LATERAL generate_series(
            0,
            FLOOR(EXTRACT(EPOCH FROM (window_end - window_start)) / 60 / (slot_minutes + buffer_minutes))::int - 1
        ) as n
    ),
    -- Get all busy periods (confirmed bookings + unavailability blocks)
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
    -- Filter available slots (exclude those overlapping with busy periods)
    available AS (
        SELECT gs.slot_start, gs.slot_end
        FROM generated_slots gs
        WHERE NOT EXISTS (
            SELECT 1 FROM busy_periods bp
            WHERE time_ranges_overlap(gs.slot_start, gs.slot_end, bp.busy_start, bp.busy_end)
        )
        -- Use dynamic minimum notice based on tutor's settings
        AND gs.slot_start >= now() + v_minimum_notice
    )
    SELECT jsonb_agg(
        jsonb_build_object('start_at', slot_start, 'end_at', slot_end)
        ORDER BY slot_start
    ) INTO v_available_slots
    FROM available;

    -- Build busy blocks (merge adjacent/overlapping periods)
    WITH busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at, end_at, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return combined result
    v_result := jsonb_build_object(
        'available_slots', COALESCE(v_available_slots, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- Verification
SELECT 
    'Function updated successfully' as status,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';
