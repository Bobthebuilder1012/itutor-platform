-- ============================================================
-- 171_calendar_exclude_cancelled_sessions.sql
-- ============================================================
-- The get_tutor_public_calendar function builds busy_blocks from
-- confirmed bookings. If a session linked to a booking is
-- CANCELLED, the tutor's slot should be freed even if the booking
-- status hasn't been updated to CANCELLED yet.
--
-- This migration updates get_tutor_public_calendar to LEFT JOIN
-- sessions and exclude any booking whose session is CANCELLED.
-- ============================================================

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_timezone text := 'America/Port_of_Spain';
    v_minimum_notice interval;
    v_availability_windows jsonb;
    v_busy_blocks jsonb;
    v_result jsonb;
BEGIN
    -- Fetch tutor-specific minimum notice period (default 24h)
    SELECT COALESCE(minimum_notice_hours, 24) * interval '1 hour'
    INTO v_minimum_notice
    FROM public.profiles
    WHERE id = p_tutor_id;

    IF NOT FOUND THEN
        v_minimum_notice := interval '24 hours';
    END IF;

    -- Build availability windows from tutor_availability_rules
    WITH raw_windows AS (
        SELECT
            (CASE WHEN p_range_start::date <= ((current_date + ((rule.day_of_week - EXTRACT(DOW FROM current_date)::int + 7) % 7) * interval '1 day'))::date
                  THEN ((current_date + ((rule.day_of_week - EXTRACT(DOW FROM current_date)::int + 7) % 7) * interval '1 day')
                         || ' ' || rule.start_time)::timestamp AT TIME ZONE v_timezone
                  ELSE NULL END
            ) AS window_start,
            (CASE WHEN p_range_start::date <= ((current_date + ((rule.day_of_week - EXTRACT(DOW FROM current_date)::int + 7) % 7) * interval '1 day'))::date
                  THEN ((current_date + ((rule.day_of_week - EXTRACT(DOW FROM current_date)::int + 7) % 7) * interval '1 day')
                         || ' ' || rule.end_time)::timestamp AT TIME ZONE v_timezone
                  ELSE NULL END
            ) AS window_end
        FROM public.tutor_availability_rules rule
        WHERE rule.tutor_id = p_tutor_id
          AND rule.day_of_week = ANY(
              ARRAY(
                  SELECT EXTRACT(DOW FROM (p_range_start + (n * interval '1 day'))::date)::int
                  FROM generate_series(0, GREATEST(0, (p_range_end::date - p_range_start::date))) AS n
              )
          )
    ),
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_start IS NOT NULL
          AND window_end IS NOT NULL
          AND window_end >= now() + v_minimum_notice
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

    -- Build busy blocks: confirmed bookings EXCLUDING those whose session is CANCELLED
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', b.confirmed_start_at,
            'end_at',   b.confirmed_end_at,
            'type',     'BOOKED'
        )
        ORDER BY b.confirmed_start_at
    ) INTO v_busy_blocks
    FROM public.bookings b
    LEFT JOIN public.sessions s ON s.booking_id = b.id
    WHERE b.tutor_id           = p_tutor_id
      AND b.status             = 'CONFIRMED'
      AND b.confirmed_start_at IS NOT NULL
      AND b.confirmed_end_at   IS NOT NULL
      AND time_ranges_overlap(b.confirmed_start_at, b.confirmed_end_at, p_range_start, p_range_end)
      -- Free the slot when the linked session has been cancelled
      AND (s.id IS NULL OR s.status <> 'CANCELLED');

    -- Also include tutor unavailability blocks
    SELECT COALESCE(v_busy_blocks, '[]'::jsonb) ||
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'start_at', ub.start_at,
                       'end_at',   ub.end_at,
                       'type',     'UNAVAILABLE'
                   )
               )
               FROM public.tutor_unavailability_blocks ub
               WHERE ub.tutor_id = p_tutor_id
                 AND time_ranges_overlap(ub.start_at, ub.end_at, p_range_start, p_range_end)),
               '[]'::jsonb
           )
    INTO v_busy_blocks;

    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks',          COALESCE(v_busy_blocks, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar(uuid, timestamptz, timestamptz) TO authenticated;
