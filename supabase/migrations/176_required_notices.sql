-- Migration: required_notices system
-- Creates a table for notices that must be acknowledged by users before they can proceed

CREATE TABLE IF NOT EXISTS public.required_notices (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                            text          NOT NULL,
  title                           text          NOT NULL,
  message                         text          NOT NULL,
  severity                        text          NOT NULL DEFAULT 'info'
                                                  CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  related_payment_id              uuid          REFERENCES public.payments(id) ON DELETE SET NULL,
  related_subscription_payment_id uuid          REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  related_booking_id              uuid          REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_session_id              uuid          REFERENCES public.sessions(id) ON DELETE SET NULL,
  related_group_id                uuid          REFERENCES public.groups(id) ON DELETE SET NULL,
  related_group_enrollment_id     uuid          REFERENCES public.group_enrollments(id) ON DELETE SET NULL,
  related_group_removal_id        uuid          REFERENCES public.group_removals(id) ON DELETE SET NULL,
  related_payout_case_id          uuid          REFERENCES public.payout_cases(id) ON DELETE SET NULL,
  related_noshow_claim_id         uuid          REFERENCES public.noshow_claims(id) ON DELETE SET NULL,
  refund_amount_ttd               numeric(12,2),
  retained_amount_ttd             numeric(12,2),
  tutor_payout_amount_ttd         numeric(12,2),
  platform_fee_impact_ttd         numeric(12,2),
  requires_ack                    boolean       NOT NULL DEFAULT true,
  acknowledged_at                 timestamptz,
  created_at                      timestamptz   NOT NULL DEFAULT now()
);

-- Index for efficiently fetching unacknowledged notices for a user, newest first
CREATE INDEX IF NOT EXISTS idx_required_notices_unacked
  ON public.required_notices (user_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- Enable Row Level Security
ALTER TABLE public.required_notices ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (idempotency)
DROP POLICY IF EXISTS "Users can read their own notices"    ON public.required_notices;
DROP POLICY IF EXISTS "Users can update their own notices"  ON public.required_notices;
DROP POLICY IF EXISTS "Service role has full access"        ON public.required_notices;

-- Users can read their own notices
CREATE POLICY "Users can read their own notices"
  ON public.required_notices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can acknowledge (update) their own notices
CREATE POLICY "Users can update their own notices"
  ON public.required_notices
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role has unrestricted access (for server-side inserts, admin ops, etc.)
CREATE POLICY "Service role has full access"
  ON public.required_notices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
