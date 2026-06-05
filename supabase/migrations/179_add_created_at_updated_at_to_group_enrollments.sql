-- group_enrollments was created by the legacy script without created_at/updated_at.
-- The check_subscription_access RPC references created_at which causes a 42703 error.

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();
