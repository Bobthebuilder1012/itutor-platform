-- =====================================================
-- MIGRATION 129: CLASS PAYMENTS LEDGER + PREPAID BLOCKS
-- NEW tables — separate from existing WiPay gateway `payments` table.
-- `class_payments` is a mutable billing ledger; `payments` is an
-- immutable gateway transaction log. They coexist.
-- =====================================================

BEGIN;

-- =====================================================
-- TABLE: class_payments
-- One row per billing event per class member.
-- billing_model determines how rows are generated:
--   per_session → one row per session occurrence
--   per_month   → one row per calendar month
--   prepaid     → one row per block purchase
-- =====================================================

CREATE TABLE IF NOT EXISTS public.class_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The class member this charge belongs to
  class_member_id uuid NOT NULL
    REFERENCES public.group_members(id) ON DELETE CASCADE,

  -- For per_session billing: links to the session occurrence
  session_id uuid
    REFERENCES public.group_session_occurrences(id) ON DELETE SET NULL,

  -- For per_month billing: e.g. '2026-06'
  billing_period text
    CHECK (billing_period ~ '^\d{4}-\d{2}$'),

  -- For prepaid billing: links to the block being drawn from
  block_id uuid, -- FK added after prepaid_blocks table is created below

  amount numeric(10,2) NOT NULL CHECK (amount >= 0),

  status text NOT NULL DEFAULT 'due'
    CHECK (status IN ('due','paid','overdue','waived')),

  paid_at timestamptz,

  -- WiPay gateway reference (populated once payment is collected)
  wipay_payment_id uuid
    REFERENCES public.payments(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Exactly one billing context per row
  CONSTRAINT class_payments_one_context CHECK (
    (
      CASE WHEN session_id     IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN billing_period IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN block_id       IS NOT NULL THEN 1 ELSE 0 END
    ) <= 1  -- 0 = manual/adjustment; 1 = linked to a context
  )
);

CREATE INDEX IF NOT EXISTS idx_class_payments_member
  ON public.class_payments(class_member_id);
CREATE INDEX IF NOT EXISTS idx_class_payments_status
  ON public.class_payments(class_member_id, status);
CREATE INDEX IF NOT EXISTS idx_class_payments_period
  ON public.class_payments(billing_period)
  WHERE billing_period IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_payments_session
  ON public.class_payments(session_id)
  WHERE session_id IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER trg_class_payments_updated_at
  BEFORE UPDATE ON public.class_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.class_payments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABLE: prepaid_blocks
-- Tracks a purchased block of N sessions for a member.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.prepaid_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  class_member_id uuid NOT NULL
    REFERENCES public.group_members(id) ON DELETE CASCADE,

  sessions_total integer NOT NULL CHECK (sessions_total > 0),
  sessions_remaining integer NOT NULL CHECK (sessions_remaining >= 0),

  -- Optional expiry (NULL = never expires)
  expires_at timestamptz,

  -- WiPay payment that funded this block
  wipay_payment_id uuid
    REFERENCES public.payments(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prepaid_remaining_lte_total
    CHECK (sessions_remaining <= sessions_total)
);

CREATE INDEX IF NOT EXISTS idx_prepaid_blocks_member
  ON public.prepaid_blocks(class_member_id);
CREATE INDEX IF NOT EXISTS idx_prepaid_blocks_active
  ON public.prepaid_blocks(class_member_id, sessions_remaining)
  WHERE sessions_remaining > 0;

CREATE TRIGGER trg_prepaid_blocks_updated_at
  BEFORE UPDATE ON public.prepaid_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.prepaid_blocks ENABLE ROW LEVEL SECURITY;

-- Now wire the FK from class_payments.block_id → prepaid_blocks
ALTER TABLE public.class_payments
  ADD CONSTRAINT class_payments_block_id_fk
  FOREIGN KEY (block_id) REFERENCES public.prepaid_blocks(id) ON DELETE SET NULL;

-- =====================================================
-- RLS: class_payments
-- Tutors see all payments for their classes.
-- Students see their own.
-- Parents see their children's.
-- =====================================================

CREATE POLICY "class_payments_tutor_select"
ON public.class_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id
      AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "class_payments_student_select"
ON public.class_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.id = class_member_id
      AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "class_payments_parent_select"
ON public.class_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.parent_child_links pcl ON pcl.child_id = gm.user_id
    WHERE gm.id = class_member_id
      AND pcl.parent_id = auth.uid()
  )
);

-- Only service role inserts/updates class_payments (via API routes)
-- No client INSERT/UPDATE/DELETE policies.

-- =====================================================
-- RLS: prepaid_blocks
-- =====================================================

CREATE POLICY "prepaid_blocks_tutor_select"
ON public.prepaid_blocks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id
      AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "prepaid_blocks_student_select"
ON public.prepaid_blocks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.id = class_member_id
      AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "prepaid_blocks_parent_select"
ON public.prepaid_blocks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.parent_child_links pcl ON pcl.child_id = gm.user_id
    WHERE gm.id = class_member_id
      AND pcl.parent_id = auth.uid()
  )
);

COMMIT;
