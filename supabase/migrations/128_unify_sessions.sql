-- =====================================================
-- MIGRATION 128: UNIFIED SESSIONS MODEL
-- Makes booking_id nullable, adds class_id nullable,
-- enforces exactly-one-source CHECK, adds recap columns.
-- Verified: existing RLS uses tutor_id/student_id, not booking_id.
-- =====================================================

BEGIN;

-- Step 1: Drop the NOT NULL and UNIQUE constraints on booking_id.
-- The UNIQUE constraint is a named constraint we must find and drop.
ALTER TABLE public.sessions
  ALTER COLUMN booking_id DROP NOT NULL;

-- Drop the unique constraint (named in migration 018 as implicit from UNIQUE keyword)
-- We identify it by finding the constraint name first:
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.sessions'::regclass
    AND contype = 'u'
    AND conname ILIKE '%booking_id%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sessions DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Restore uniqueness only for rows where booking_id IS NOT NULL
-- (a booking still maps to exactly one session)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_booking_id_notnull
  ON public.sessions(booking_id)
  WHERE booking_id IS NOT NULL;

-- Step 2: Add class_id (nullable FK → groups)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS class_id uuid
    REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON public.sessions(class_id)
  WHERE class_id IS NOT NULL;

-- Step 3: Enforce exactly-one-source: either booking_id or class_id, never both, never neither.
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_exactly_one_source;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_exactly_one_source
  CHECK (
    (booking_id IS NOT NULL AND class_id IS NULL)
    OR
    (booking_id IS NULL AND class_id IS NOT NULL)
  );

-- Step 4: Add recap columns
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS recap_draft text,
  ADD COLUMN IF NOT EXISTS recap_approved boolean NOT NULL DEFAULT false;

-- Step 5: Extend status to include class-session lifecycle states
-- Existing: SCHEDULED | JOIN_OPEN | COMPLETED_ASSUMED | NO_SHOW_STUDENT | EARLY_END_SHORT | CANCELLED
-- Add:      COMPLETED (explicit completion for class sessions)
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN (
    'SCHEDULED',
    'JOIN_OPEN',
    'COMPLETED',
    'COMPLETED_ASSUMED',
    'NO_SHOW_STUDENT',
    'EARLY_END_SHORT',
    'CANCELLED'
  ));

-- Step 6: RLS — existing policies use tutor_id/student_id only (no booking_id reference).
-- No policy changes required. Verify class-session access by joining to groups:

-- Add parent read access to sessions for their children's class sessions
CREATE POLICY "Parents can view their children sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_child_links pcl
    WHERE pcl.parent_id = auth.uid()
      AND pcl.child_id = public.sessions.student_id
  )
);

COMMIT;

-- =====================================================
-- APP-LAYER NOTE
-- API routes that must handle booking_id nullable:
--   app/api/sessions/create-for-booking/route.ts
--     — no change; booking_id is always provided in this flow.
--   app/api/tutor/sessions/route.ts
--     — queries by tutor_id; unaffected.
--   Cron routes (send-reminders)
--     — filters by scheduled_start_at + status; unaffected.
-- New class session creation goes through a separate API route
-- (app/api/groups/[groupId]/sessions/.../occurrences) which will
-- eventually INSERT into sessions with class_id set and booking_id NULL.
-- =====================================================
