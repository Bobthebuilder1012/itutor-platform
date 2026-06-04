-- ============================================================
-- 173_calendar_trinidad_date_fix.sql
-- ============================================================
-- Migration 172 uses p_range_start::date to start the date_series.
-- p_range_start arrives from the browser as UTC midnight (local time).
-- In Trinidad (UTC-4) at night, midnight local = 4am UTC next day,
-- so p_range_start::date (UTC) skips today's Trinidad date entirely.
--
-- Fix: Use (p_range_start AT TIME ZONE v_timezone)::date so the
-- date_series starts from Trinidad's "today", not UTC's.
-- ============================================================

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
    v_tz_start date;
    v_tz_end   date;
BEGIN
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles WHERE id = p_tutor_id;

    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';
    ELSE
        v_minimum_notice := interval '24 hours';
    END IF;

    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Convert range bounds to Trinidad date so the day series starts
    -- from Trinidad's "today", not UTC's.
    v_tz_start := (p_range_start AT TIME ZONE v_timezone)::date;
    v_tz_end   := (p_range_end   AT TIME ZONE v_timezone)::date;

    WITH RECURSIVE date_series AS (
        SELECT v_tz_start AS day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < v_tz_end
    ),
    raw_windows AS (
        SELECT
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz AS window_start,
            ((ds.day || ' ' ||
                CASE
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz AS window_end
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id  = p_tutor_id
          AND ar.is_active = true
          AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
    ),
    busy_periods AS (
        SELECT b.confirmed_start_at AS busy_start,
               b.confirmed_end_at   AS busy_end,
               'BOOKED'             AS busy_type
        FROM public.bookings b
        LEFT JOIN public.sessions s ON s.booking_id = b.id
        WHERE b.tutor_id           = p_tutor_id
          AND b.status             = 'CONFIRMED'
          AND b.confirmed_start_at IS NOT NULL
          AND b.confirmed_end_at   IS NOT NULL
          AND time_ranges_overlap(b.confirmed_start_at, b.confirmed_end_at, p_range_start, p_range_end)
          AND (s.id IS NULL OR s.status <> 'CANCELLED')

        UNION ALL

        SELECT start_at AS busy_start, end_at AS busy_end, 'UNAVAILABLE' AS busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
          AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end   >= now() + v_minimum_notice
          AND window_start  < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', GREATEST(window_start, now() + v_minimum_notice),
            'end_at',   window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at',   busy_end,
            'type',     busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks',          COALESCE(v_busy_blocks, '[]'::jsonb),
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar(uuid, timestamptz, timestamptz) TO authenticated;
