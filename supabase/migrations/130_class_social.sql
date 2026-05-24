-- =====================================================
-- MIGRATION 130: RECURRING REQUESTS, WAITLIST EXTENSION,
--                DISCOUNTS, WARNINGS
-- =====================================================

BEGIN;

-- =====================================================
-- TABLE: recurring_requests
-- Student-initiated "I want recurring 1:1 sessions" flow.
-- Distinct from lesson_offers (tutor-initiated single-session offer).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.recurring_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','terms_set','confirmed','declined')),

  -- Flexible JSONB blob: subject, level, preferred days/times, frequency, budget etc.
  proposed_terms jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- If accepted and a class is created, link it
  class_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rr_not_self CHECK (tutor_id != student_id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_requests_tutor
  ON public.recurring_requests(tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_requests_student
  ON public.recurring_requests(student_id, status);

CREATE TRIGGER trg_recurring_requests_updated_at
  BEFORE UPDATE ON public.recurring_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.recurring_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_requests_tutor_all"
ON public.recurring_requests FOR ALL TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "recurring_requests_student_select"
ON public.recurring_requests FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "recurring_requests_student_insert"
ON public.recurring_requests FOR INSERT TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
  )
);

CREATE POLICY "recurring_requests_student_update"
ON public.recurring_requests FOR UPDATE TO authenticated
USING (student_id = auth.uid())
WITH CHECK (
  student_id = auth.uid()
  -- Students can only confirm or withdraw, not set terms
  AND status IN ('confirmed','declined')
);

-- =====================================================
-- EXTEND: group_waitlist_entries
-- Add offer lifecycle tracking.
-- Create the table first if 094 was never applied.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.group_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_waitlist_student UNIQUE (student_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_waitlist_group_position
  ON public.group_waitlist_entries(group_id, position);

ALTER TABLE public.group_waitlist_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist select') THEN
    CREATE POLICY "Group waitlist select" ON public.group_waitlist_entries
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist insert') THEN
    CREATE POLICY "Group waitlist insert" ON public.group_waitlist_entries
      FOR INSERT TO authenticated
      WITH CHECK (student_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist delete') THEN
    CREATE POLICY "Group waitlist delete" ON public.group_waitlist_entries
      FOR DELETE TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;
END $$;

-- Now extend with offer lifecycle columns
ALTER TABLE public.group_waitlist_entries
  ADD COLUMN IF NOT EXISTS offer_status text NOT NULL DEFAULT 'waiting'
    CHECK (offer_status IN ('waiting','offered','accepted','expired')),
  ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_waitlist_offer_status
  ON public.group_waitlist_entries(group_id, offer_status)
  WHERE offer_status IN ('offered');

-- =====================================================
-- TABLE: discounts
-- One active discount per class at DB level (partial unique index).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  class_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,

  type text NOT NULL
    CHECK (type IN ('early_bird','time_limited','open_ended')),

  -- Percentage off (0-100) or fixed TTD amount depending on value_type
  value numeric(10,2) NOT NULL CHECK (value > 0),
  value_type text NOT NULL DEFAULT 'percent'
    CHECK (value_type IN ('percent','fixed_ttd')),

  -- Flexible condition: seat count threshold, date range, etc.
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,

  active boolean NOT NULL DEFAULT true,

  starts_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce max one ACTIVE discount per class at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_discounts_one_active_per_class
  ON public.discounts(class_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_discounts_class
  ON public.discounts(class_id, active);

CREATE TRIGGER trg_discounts_updated_at
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

-- Tutors manage their own discounts
CREATE POLICY "discounts_tutor_all"
ON public.discounts FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = class_id AND g.tutor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = class_id AND g.tutor_id = auth.uid()
  )
);

-- Active discounts are visible to authenticated users browsing the marketplace
CREATE POLICY "discounts_public_select"
ON public.discounts FOR SELECT TO authenticated
USING (active = true);

-- =====================================================
-- TABLE: warnings
-- Tutor sends a warning to a class member.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  class_member_id uuid NOT NULL
    REFERENCES public.group_members(id) ON DELETE CASCADE,

  message text NOT NULL,

  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by_tutor_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_warnings_member
  ON public.warnings(class_member_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_warnings_tutor
  ON public.warnings(sent_by_tutor_id);

ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;

-- Tutor sees all warnings they sent
CREATE POLICY "warnings_tutor_select"
ON public.warnings FOR SELECT TO authenticated
USING (sent_by_tutor_id = auth.uid());

CREATE POLICY "warnings_tutor_insert"
ON public.warnings FOR INSERT TO authenticated
WITH CHECK (
  sent_by_tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.id = class_member_id AND g.tutor_id = auth.uid()
  )
);

-- Student sees warnings about themselves
CREATE POLICY "warnings_student_select"
ON public.warnings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.id = class_member_id AND gm.user_id = auth.uid()
  )
);

-- Parent sees warnings about their child
CREATE POLICY "warnings_parent_select"
ON public.warnings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.parent_child_links pcl ON pcl.child_id = gm.user_id
    WHERE gm.id = class_member_id AND pcl.parent_id = auth.uid()
  )
);

COMMIT;
