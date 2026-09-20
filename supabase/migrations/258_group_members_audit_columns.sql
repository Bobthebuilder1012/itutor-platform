-- =====================================================
-- GROUP_MEMBERS AUDIT COLUMNS -- REPAIR THE DRIFT
-- =====================================================
-- Verified 2026-09-20 against both databases: production `group_members` has
-- 14 columns, staging has 5 (id, group_id, user_id, status, joined_at). The
-- nine below are created by NO migration in this repository -- they were
-- applied to production out-of-band, the same way groups.schedule_data was.
--
-- WHY THIS MATTERS RIGHT NOW. Four live write paths name these columns, and
-- PostgREST rejects the whole statement with PGRST204 where they are absent:
--   app/api/classes/[id]/join/route.ts            status_changed_at, status_reason, initiated_by
--   app/api/classes/[id]/members/[memberId]/approve/route.ts
--                                                 status_changed_at, status_changed_by
--   lib/server/classJoinRequests.ts               action_reason
-- So on staging the tutor-approval flow fails outright, and a student holding
-- a prior 'removed' row cannot rejoin -- performGroupJoin's update fails and
-- the caller reports "Could not join this class."
--
-- The application code is correct; the database is the one that drifted. This
-- migration is therefore a no-op on production and a repair on staging, and it
-- has to land before class_joined is wired into those routes -- otherwise the
-- new event looks broken when it is the route underneath that is.
--
-- Column types mirror production exactly. No CHECK constraints and no
-- defaults beyond production's, so a row written on one database is portable
-- to the other.

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS parent_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initiated_by      text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS action_reason     text,
  ADD COLUMN IF NOT EXISTS actioned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS actioned_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_until   timestamptz;

COMMENT ON COLUMN public.group_members.initiated_by IS
  'Who caused the row to exist: student | tutor | parent. Written by the join '
  'and invite routes.';

COMMENT ON COLUMN public.group_members.status_changed_at IS
  'When status last moved. Distinct from joined_at, which records the original '
  'request rather than the approval.';
