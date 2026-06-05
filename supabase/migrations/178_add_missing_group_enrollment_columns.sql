-- group_enrollments was created by the legacy scripts/create-group-lessons.sql
-- script. The activate_subscription RPC (migration 159/160) references three
-- columns that were only in CREATE TABLE statements (skipped because the table
-- already existed) and were never added via ALTER TABLE. Add them now.

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS expires_at                         timestamptz,
  ADD COLUMN IF NOT EXISTS last_paid_at                       timestamptz,
  ADD COLUMN IF NOT EXISTS activated_subscription_payment_id  uuid;
