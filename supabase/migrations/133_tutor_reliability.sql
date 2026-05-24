-- =====================================================
-- MIGRATION 133: TUTOR RELIABILITY
-- Extends tutor_response_metrics with feedback_on_time_rate.
-- Adds tutor_reliability view for analytics queries.
-- =====================================================

BEGIN;

-- =====================================================
-- EXTEND: tutor_response_metrics
-- Actual columns: tutor_id, avg_first_response_seconds_30d,
--   total_bookings_30d, total_confirmed_30d, updated_at
-- Add feedback timeliness columns.
-- =====================================================

ALTER TABLE public.tutor_response_metrics
  ADD COLUMN IF NOT EXISTS feedback_on_time_rate numeric(5,2)
    CHECK (feedback_on_time_rate IS NULL OR (feedback_on_time_rate >= 0 AND feedback_on_time_rate <= 100)),
  ADD COLUMN IF NOT EXISTS feedback_last_calculated_at timestamptz;

-- =====================================================
-- VIEW: tutor_reliability
-- Single surface for all reliability signals.
-- =====================================================

CREATE OR REPLACE VIEW public.tutor_reliability AS
SELECT
  trm.tutor_id,
  trm.avg_first_response_seconds_30d,
  trm.total_bookings_30d,
  trm.total_confirmed_30d,
  -- derived confirmation rate
  CASE
    WHEN trm.total_bookings_30d > 0
    THEN ROUND((trm.total_confirmed_30d::numeric / trm.total_bookings_30d) * 100, 2)
    ELSE NULL
  END AS confirmation_rate_pct,
  trm.feedback_on_time_rate,
  trm.feedback_last_calculated_at,
  trm.updated_at AS last_calculated_at
FROM public.tutor_response_metrics trm;

-- =====================================================
-- FUNCTION: recalculate_feedback_on_time_rate(tutor_id)
-- Called by cron or on report status change.
-- =====================================================

CREATE OR REPLACE FUNCTION public.recalculate_feedback_on_time_rate(p_tutor_id uuid)
RETURNS void AS $$
DECLARE
  v_total integer;
  v_on_time integer;
  v_rate numeric(5,2);
BEGIN
  -- Count reports in the last 90 days that were due
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE pfr.sent_at <= pfr.due_at)
  INTO v_total, v_on_time
  FROM public.parent_feedback_reports pfr
  JOIN public.group_members gm ON gm.id = pfr.class_member_id
  JOIN public.groups g ON g.id = gm.group_id
  WHERE g.tutor_id = p_tutor_id
    AND pfr.due_at IS NOT NULL
    AND pfr.due_at >= now() - interval '90 days';

  IF v_total = 0 THEN
    v_rate := NULL;
  ELSE
    v_rate := ROUND((v_on_time::numeric / v_total) * 100, 2);
  END IF;

  INSERT INTO public.tutor_response_metrics (
    tutor_id,
    avg_first_response_seconds_30d,
    total_bookings_30d,
    total_confirmed_30d,
    feedback_on_time_rate,
    feedback_last_calculated_at
  )
  VALUES (p_tutor_id, 0, 0, 0, v_rate, now())
  ON CONFLICT (tutor_id) DO UPDATE
    SET feedback_on_time_rate        = EXCLUDED.feedback_on_time_rate,
        feedback_last_calculated_at  = EXCLUDED.feedback_last_calculated_at,
        updated_at                   = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
