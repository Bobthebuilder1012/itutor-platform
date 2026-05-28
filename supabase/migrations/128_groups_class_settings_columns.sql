-- Add missing class settings columns to the groups table

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS require_join_requests  boolean        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_suspend_missed_payment boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_period_days       integer        NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS google_classroom_link   text,
  ADD COLUMN IF NOT EXISTS feedback_mode           text           NOT NULL DEFAULT 'off';

ALTER TABLE public.groups
  ADD CONSTRAINT groups_feedback_mode_check
  CHECK (feedback_mode IN ('off', 'included', 'paid_addon'))
  NOT VALID;
