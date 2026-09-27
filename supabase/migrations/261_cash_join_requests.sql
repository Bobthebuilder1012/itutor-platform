-- 261_cash_join_requests.sql
--
-- Cash as ASK-TO-JOIN. The student asks to join a physical class paying cash;
-- the tutor accepts or declines. Replaces the instant cash hold, which put a
-- stranger in a scarce physical seat on one tap with nobody's say-so.
--
-- Additive only. Nothing reads either object until the app ships, and the app
-- tolerates both being absent (the request route answers 503, the Cash tab
-- degrades to "not available").
--
-- ── WHY A TABLE AND NOT group_members.pending_approval ─────────────────────
-- A member row carries neither the seat type nor the payment method, and the
-- approve route that settles it writes status alone. Folding cash into it
-- would mean an approval that silently becomes a free online seat.
--
-- ── WHY missed_at AND NOT A NEW status ─────────────────────────────────────
-- subscription_payments.status has a CHECK that a dozen readers rely on, and a
-- missed cash month is not a payment state the gateway paths should ever see.
-- It is the tutor's bookkeeping note that the month went unpaid.

CREATE TABLE IF NOT EXISTS public.cash_join_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seat_type     text NOT NULL DEFAULT 'physical' CHECK (seat_type IN ('online', 'physical')),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  note          text CHECK (note IS NULL OR char_length(note) <= 500),
  decline_reason text CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 500),
  enrollment_id uuid REFERENCES public.group_enrollments(id) ON DELETE SET NULL,
  decided_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One open request per student per class. Asking twice returns the first.
CREATE UNIQUE INDEX IF NOT EXISTS cash_join_requests_one_pending
  ON public.cash_join_requests (group_id, student_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cash_join_requests_group_status
  ON public.cash_join_requests (group_id, status);

-- Service-role only. Every read and write goes through an API route that
-- checks tutor ownership or student identity; no client policy is needed,
-- and granting none means a public view can never expose it by accident.
ALTER TABLE public.cash_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_join_requests FROM anon, authenticated;

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS missed_at timestamptz,
  ADD COLUMN IF NOT EXISTS missed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscription_payments.missed_at IS
  'Cash bookkeeping: the tutor marked this month as not paid. Never set on card rows.';
