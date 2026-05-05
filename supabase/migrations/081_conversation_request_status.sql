-- =====================================================
-- CONVERSATION REQUEST STATUS (student-to-student)
-- First message = request; receiver must accept to continue.
-- =====================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status text NULL
    CHECK (status IS NULL OR status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  ADD COLUMN IF NOT EXISTS initiated_by_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_initiated_by ON public.conversations(initiated_by_id) WHERE initiated_by_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.status IS 'For student-student: PENDING = awaiting accept, ACCEPTED = can chat, DECLINED = request declined. NULL = legacy or non-student convos (treated as open).';
COMMENT ON COLUMN public.conversations.initiated_by_id IS 'User who sent the first message (the request); used when status = PENDING.';
