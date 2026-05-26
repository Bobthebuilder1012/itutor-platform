-- Migration 130: Fix group_members status constraint conflict.
-- Migration 127 added 'group_members_status_check' with the wrong set of values,
-- which conflicts with the pre-existing 'group_members_status_chk' constraint.
-- Drop both and replace with a single unified constraint covering all valid states.

ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_status_check;

ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_status_chk;

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_status_chk
  CHECK (status IN (
    'invited',
    'active',
    'pending',
    'approved',
    'denied',
    'suspended',
    'banned',
    'removed',
    'pending_approval',
    'suspended_payment',
    'rejected',
    'archived'
  ))
  NOT VALID;
