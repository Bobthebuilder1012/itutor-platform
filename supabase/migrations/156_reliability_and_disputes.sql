-- =====================================================
-- RELIABILITY + DISPUTES SCHEMA
-- =====================================================
-- Builds the policy layer that consumes the payment primitive
-- shipped in mig 152 (refundService / apply_refund_side_effects):
--
-- 1. cancellation_events     – student cancellation history, 30d rolling
-- 2. tutor_strikes           – tutor reliability strikes, 90d rolling
-- 3. reliability_warnings    – admin-issued warnings (auto-flagged at threshold)
-- 4. noshow_claims           – student no-show dispute claims with 12h tutor response window
-- 5. ratings (extended)      – system-issued auto-ratings (1*, 2*) with appeal workflow
-- 6. SQL helpers             – current_student_cancel_state / current_tutor_strike_state
--
-- Counters are computed live via SQL functions rather than denormalised
-- on profiles so we never serve a stale strike count after expiry.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. cancellation_events
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cancellation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id      uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  session_id      uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  cancelled_at    timestamptz NOT NULL DEFAULT now(),
  scheduled_start_at timestamptz,
  hours_before    numeric(8,2),
  was_late        boolean NOT NULL DEFAULT false,
  fee_applied     boolean NOT NULL DEFAULT false,
  fee_amount_ttd  numeric(12,2) NOT NULL DEFAULT 0,
  reason          text,
  source          text NOT NULL DEFAULT 'student_cancel'
                  CHECK (source IN ('student_cancel','counter_offer_rejected')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_events_student_time
  ON public.cancellation_events(student_id, cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_cancellation_events_booking
  ON public.cancellation_events(booking_id);

ALTER TABLE public.cancellation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own cancellation events" ON public.cancellation_events;
CREATE POLICY "Students read own cancellation events"
  ON public.cancellation_events FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access cancellation_events" ON public.cancellation_events;
CREATE POLICY "Service role full access cancellation_events"
  ON public.cancellation_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 2. tutor_strikes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tutor_strikes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  reason       text NOT NULL
                CHECK (reason IN ('tutor_cancelled','tutor_super_late_cancel','tutor_noshow','admin_manual')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  cleared_at   timestamptz,
  cleared_by   uuid REFERENCES public.profiles(id),
  cleared_note text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_strikes_tutor_active
  ON public.tutor_strikes(tutor_id, expires_at)
  WHERE cleared_at IS NULL;

ALTER TABLE public.tutor_strikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutors read own strikes" ON public.tutor_strikes;
CREATE POLICY "Tutors read own strikes"
  ON public.tutor_strikes FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access tutor_strikes" ON public.tutor_strikes;
CREATE POLICY "Service role full access tutor_strikes"
  ON public.tutor_strikes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 3. reliability_warnings
--    System auto-flags candidates; admin reviews + issues.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.reliability_warnings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_role      text NOT NULL CHECK (user_role IN ('student','tutor')),
  flag_reason    text NOT NULL
                  CHECK (flag_reason IN (
                    'student_cancellation_threshold',
                    'tutor_strike_threshold',
                    'tutor_suspension_threshold',
                    'student_noshow_repeat',
                    'admin_manual'
                  )),
  flagged_at     timestamptz NOT NULL DEFAULT now(),
  trigger_count  integer,
  status         text NOT NULL DEFAULT 'pending_admin'
                  CHECK (status IN ('pending_admin','issued','dismissed','expired')),
  issued_by      uuid REFERENCES public.profiles(id),
  issued_at      timestamptz,
  issued_note    text,
  dismissed_by   uuid REFERENCES public.profiles(id),
  dismissed_at   timestamptz,
  dismissed_note text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reliability_warnings_status
  ON public.reliability_warnings(status, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_reliability_warnings_user
  ON public.reliability_warnings(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reliability_warnings_open_per_user_reason
  ON public.reliability_warnings(user_id, flag_reason)
  WHERE status IN ('pending_admin','issued');

ALTER TABLE public.reliability_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own warnings" ON public.reliability_warnings;
CREATE POLICY "Users read own warnings"
  ON public.reliability_warnings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access reliability_warnings" ON public.reliability_warnings;
CREATE POLICY "Service role full access reliability_warnings"
  ON public.reliability_warnings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 4. noshow_claims
-- =====================================================
CREATE TABLE IF NOT EXISTS public.noshow_claims (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  booking_id               uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  claimant_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimant_role            text NOT NULL CHECK (claimant_role IN ('student','tutor')),
  defendant_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evidence_type            text,
  evidence_files           jsonb NOT NULL DEFAULT '[]'::jsonb,
  written_explanation      text NOT NULL CHECK (length(written_explanation) >= 20),
  response_deadline        timestamptz NOT NULL,
  defendant_response       text,
  defendant_evidence_files jsonb DEFAULT '[]'::jsonb,
  defendant_responded_at   timestamptz,
  status                   text NOT NULL DEFAULT 'awaiting_response'
                            CHECK (status IN (
                              'awaiting_response',
                              'pending_admin',
                              'resolved'
                            )),
  admin_verdict            text CHECK (admin_verdict IN ('tutor_noshow','student_noshow','tie')),
  admin_id                 uuid REFERENCES public.profiles(id),
  admin_decided_at         timestamptz,
  admin_notes              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_noshow_claims_session
  ON public.noshow_claims(session_id);
CREATE INDEX IF NOT EXISTS idx_noshow_claims_status
  ON public.noshow_claims(status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_noshow_claims_claimant
  ON public.noshow_claims(claimant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_noshow_claims_defendant
  ON public.noshow_claims(defendant_id, created_at DESC);

ALTER TABLE public.noshow_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read own noshow claims" ON public.noshow_claims;
CREATE POLICY "Participants read own noshow claims"
  ON public.noshow_claims FOR SELECT
  TO authenticated
  USING (claimant_id = auth.uid() OR defendant_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access noshow_claims" ON public.noshow_claims;
CREATE POLICY "Service role full access noshow_claims"
  ON public.noshow_claims FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 5. ratings — system-issued + appeal columns
--    System ratings live in the same table so they fold into
--    the same average computation used by /api/public/tutors/:id/reviews.
-- =====================================================
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS system_issued         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_reason         text
    CHECK (system_reason IS NULL OR system_reason IN ('tutor_noshow','tutor_super_late_cancel')),
  ADD COLUMN IF NOT EXISTS appeal_status         text
    CHECK (appeal_status IS NULL OR appeal_status IN ('pending','upheld','overturned')),
  ADD COLUMN IF NOT EXISTS appeal_text           text,
  ADD COLUMN IF NOT EXISTS appealed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_decided_by     uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS appeal_decided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_decision_notes text,
  ADD COLUMN IF NOT EXISTS is_active             boolean NOT NULL DEFAULT true;

-- System-issued ratings are not tied to a real student review row.
-- The existing unique_session_rating constraint forbids two ratings
-- on the same session, so the auto-rating writer must check first.

-- =====================================================
-- 6. Helper functions
-- =====================================================

-- Student cancellation state, 30-day rolling.
CREATE OR REPLACE FUNCTION public.current_student_cancel_state(p_student_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_count        integer;
  v_warned       boolean;
  v_warning_at   timestamptz;
BEGIN
  SELECT COUNT(*)
    INTO v_count
  FROM public.cancellation_events
  WHERE student_id = p_student_id
    AND cancelled_at >= now() - interval '30 days';

  SELECT issued_at INTO v_warning_at
  FROM public.reliability_warnings
  WHERE user_id = p_student_id
    AND user_role = 'student'
    AND status = 'issued'
    AND flag_reason = 'student_cancellation_threshold'
  ORDER BY issued_at DESC NULLS LAST
  LIMIT 1;

  v_warned := v_warning_at IS NOT NULL;

  RETURN jsonb_build_object(
    'count_30d',     v_count,
    'is_warned',     v_warned,
    'warning_issued_at', v_warning_at,
    'late_cancel_fee_applies', v_warned
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.current_student_cancel_state(uuid) TO authenticated, service_role;

-- Tutor strike state, 90-day rolling.
CREATE OR REPLACE FUNCTION public.current_tutor_strike_state(p_tutor_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)
    INTO v_count
  FROM public.tutor_strikes
  WHERE tutor_id = p_tutor_id
    AND cleared_at IS NULL
    AND expires_at > now();

  RETURN jsonb_build_object(
    'active_strikes', v_count,
    'warning_threshold', 3,
    'suspension_threshold', 5,
    'is_warned_candidate', v_count >= 3,
    'is_suspension_candidate', v_count >= 5
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.current_tutor_strike_state(uuid) TO authenticated, service_role;

-- Auto-flag a warning candidate (idempotent — no-op if one is already open).
CREATE OR REPLACE FUNCTION public.flag_reliability_warning(
  p_user_id      uuid,
  p_user_role    text,
  p_flag_reason  text,
  p_trigger_count integer DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_existing uuid;
  v_new_id   uuid;
BEGIN
  SELECT id INTO v_existing
  FROM public.reliability_warnings
  WHERE user_id = p_user_id
    AND flag_reason = p_flag_reason
    AND status IN ('pending_admin','issued');

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.reliability_warnings (
    user_id, user_role, flag_reason, trigger_count, status, flagged_at, created_at
  ) VALUES (
    p_user_id, p_user_role, p_flag_reason, p_trigger_count, 'pending_admin', now(), now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.flag_reliability_warning(uuid, text, text, integer) TO service_role;

-- updated_at trigger for noshow_claims
CREATE OR REPLACE FUNCTION public.tg_noshow_claims_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS noshow_claims_set_updated_at ON public.noshow_claims;
CREATE TRIGGER noshow_claims_set_updated_at
  BEFORE UPDATE ON public.noshow_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_noshow_claims_set_updated_at();

COMMIT;
