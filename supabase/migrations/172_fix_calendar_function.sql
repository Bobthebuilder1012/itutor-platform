-- ============================================================
-- 172_fix_calendar_function.sql
-- ============================================================
-- Migration 171 incorrectly rewrote get_tutor_public_calendar,
-- breaking the RECURSIVE date_series logic and changing the
-- minimum-notice default from allow_same_day_bookings (0 min)
-- to 24 hours.
--
-- This migration restores the original function (migration 074)
-- with ONE addition: the busy_blocks query LEFT JOINs sessions
-- to exclude bookings whose session is CANCELLED, freeing the
-- tutor's slot for rebooking.
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
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Check if tutor allows same-day bookings (default: true)
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

    -- Build availability windows from tutor's availability rules.
    -- Uses RECURSIVE date_series to generate one window per rule per day
    -- across the full requested range (not just the next occurrence).
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date AS day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
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
    -- Get busy periods: confirmed bookings (excluding cancelled sessions)
    -- + unavailability blocks
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
          -- Free the slot when the linked session was cancelled
          AND (s.id IS NULL OR s.status <> 'CANCELLED')

        UNION ALL

        SELECT start_at AS busy_start, end_at AS busy_end, 'UNAVAILABLE' AS busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
          AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    -- Keep only future windows (respecting minimum notice)
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end >= now() + v_minimum_notice
          AND window_start < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', GREATEST(window_start, now() + v_minimum_notice),
            'end_at',   window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    -- Build busy blocks JSON (separate from availability so client can render both)
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
