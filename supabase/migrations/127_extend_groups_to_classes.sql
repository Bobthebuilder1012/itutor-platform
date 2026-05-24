-- =====================================================
-- MIGRATION 127: EXTEND GROUPS → CLASSES
-- Additive columns on groups + group_members status remap
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: EXTEND groups TABLE
-- =====================================================

-- Billing
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS billing_model text
    CHECK (billing_model IN ('per_session', 'per_month', 'prepaid')),
  ADD COLUMN IF NOT EXISTS billing_timing text
    CHECK (billing_timing IN ('start', 'end')),  -- immutable after first save (trigger below)
  ADD COLUMN IF NOT EXISTS service_fee_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (service_fee_pct >= 0 AND service_fee_pct <= 100),

  -- Access / visibility (separate from DRAFT/PUBLISHED/ARCHIVED status)
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,

  -- Suspension / grace
  ADD COLUMN IF NOT EXISTS auto_suspend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_window_days integer NOT NULL DEFAULT 7
    CHECK (grace_window_days >= 0),

  -- Communication channels
  ADD COLUMN IF NOT EXISTS primary_channel text NOT NULL DEFAULT 'native'
    CHECK (primary_channel IN ('native', 'whatsapp', 'google_classroom')),
  ADD COLUMN IF NOT EXISTS whatsapp_url text,
  ADD COLUMN IF NOT EXISTS classroom_url text,

  -- Parent feedback
  ADD COLUMN IF NOT EXISTS parent_feedback_mode text NOT NULL DEFAULT 'off'
    CHECK (parent_feedback_mode IN ('off', 'included', 'paid')),
  ADD COLUMN IF NOT EXISTS parent_feedback_price numeric(10,2)
    CHECK (parent_feedback_price IS NULL OR parent_feedback_price >= 0);

-- Ensure pricing_model column exists (added in 094; guard for instances that skipped it)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'FREE';

-- Ensure max_students column exists (added in 094; guard for instances that skipped it)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS max_students integer NOT NULL DEFAULT 20;

-- Extend pricing_model CHECK to include PREPAID
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_pricing_model_check;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_pricing_model_check
  CHECK (pricing_model IN ('PER_SESSION', 'MONTHLY', 'FREE', 'PREPAID'));

-- Extend max_students upper bound to 500
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_max_students_check;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_max_students_check
  CHECK (max_students > 0 AND max_students <= 500);

CREATE INDEX IF NOT EXISTS idx_groups_visibility ON public.groups(visibility);
CREATE INDEX IF NOT EXISTS idx_groups_billing_model ON public.groups(billing_model);

-- =====================================================
-- PART 2: BILLING_TIMING IMMUTABILITY TRIGGER
-- Once billing_timing is set on a published class it cannot change.
-- =====================================================

CREATE OR REPLACE FUNCTION enforce_billing_timing_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.billing_timing IS NOT NULL
     AND OLD.billing_timing IS DISTINCT FROM NEW.billing_timing
  THEN
    RAISE EXCEPTION
      'billing_timing is immutable once set (class id: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_timing_immutable ON public.groups;
CREATE TRIGGER trg_billing_timing_immutable
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION enforce_billing_timing_immutable();

-- =====================================================
-- PART 3: group_members — status remap + new columns
-- =====================================================
-- Existing values: pending | approved | denied
-- Target values:   invited | active | suspended | removed
-- Mapping:  pending → invited, approved → active, denied → removed

-- Step 3a: widen the CHECK to allow both old and new values during migration
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending','approved','denied','invited','active','suspended','removed'));

-- Step 3b: remap existing rows
UPDATE public.group_members SET status = 'invited'  WHERE status = 'pending';
UPDATE public.group_members SET status = 'active'   WHERE status = 'approved';
UPDATE public.group_members SET status = 'removed'  WHERE status = 'denied';

-- Step 3c: drop old values from CHECK
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('invited','active','suspended','removed'));

-- Update the default so new inserts use the new vocabulary
ALTER TABLE public.group_members ALTER COLUMN status SET DEFAULT 'invited';

-- Step 3d: add new columns
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'student'
    CHECK (initiated_by IN ('student','parent','tutor_invite'));

CREATE INDEX IF NOT EXISTS idx_group_members_parent ON public.group_members(parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_members_status_new ON public.group_members(group_id, status);

-- =====================================================
-- PART 4: update RLS to use new status values
-- =====================================================

-- group_members_select: was checking status = 'approved'
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select"
ON public.group_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
    )
  )
  -- Parents can see their child's membership
  OR EXISTS (
    SELECT 1 FROM public.parent_child_links pcl
    WHERE pcl.parent_id = auth.uid()
      AND pcl.child_id = group_members.user_id
  )
);

-- group_members_insert: students/parents join as 'invited'
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'invited'
);

-- group_members_update: tutor activates/suspends/removes; parent can initiate for child
DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
CREATE POLICY "group_members_update"
ON public.group_members FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (
    parent_id = auth.uid()
    AND status IN ('invited','active')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (
    parent_id = auth.uid()
    AND status IN ('invited','active')
  )
);

-- group_members_delete: unchanged logic
DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete"
ON public.group_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

-- group_sessions_select: update 'approved' → 'active'
DROP POLICY IF EXISTS "group_sessions_select" ON public.group_sessions;
CREATE POLICY "group_sessions_select"
ON public.group_sessions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_sessions.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'active'
  )
);

-- group_messages_select: update 'approved' → 'active'
DROP POLICY IF EXISTS "group_messages_select" ON public.group_messages;
CREATE POLICY "group_messages_select"
ON public.group_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_messages.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'active'
  )
);

-- group_messages_insert: update 'approved' → 'active'
DROP POLICY IF EXISTS "group_messages_insert" ON public.group_messages;
CREATE POLICY "group_messages_insert"
ON public.group_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
    )
  )
  AND (
    parent_message_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.group_messages pm
      WHERE pm.id = parent_message_id AND pm.is_locked = true
    )
  )
);

-- group_session_occurrences_select: update 'approved' → 'active'
DROP POLICY IF EXISTS "group_session_occurrences_select" ON public.group_session_occurrences;
CREATE POLICY "group_session_occurrences_select"
ON public.group_session_occurrences FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.group_members gm ON gm.group_id = gs.group_id
    WHERE gs.id = group_session_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'active'
  )
);

COMMIT;

-- =====================================================
-- APP-LAYER NOTE
-- The following TypeScript files reference group_members status
-- values that must be updated from old → new vocabulary:
--
--   'pending'  → 'invited'
--   'approved' → 'active'
--   'denied'   → 'removed'  (not found in app code — safe)
--
-- Files to update:
--   components/groups/tutor/MemberList.tsx
--   components/groups/tutor/TutorGroupView.tsx
--   components/groups/student/GroupPreview.tsx
--   components/groups/student/GroupMemberView.tsx
--   components/groups/student/StudentLessonsClient.tsx
--   components/groups/GroupDetailPanel.tsx
--   app/groups/GroupsPageClient.tsx
--   app/api/groups/[groupId]/route.ts
--   app/api/groups/[groupId]/messages/route.ts
--   app/api/groups/[groupId]/sessions/.../occurrences/route.ts
--   app/api/groups/[groupId]/retention/route.ts
--   app/api/groups/[groupId]/analytics/route.ts
--   app/tutor/lessons/page.tsx
-- =====================================================
