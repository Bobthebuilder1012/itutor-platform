ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pause_1on1 boolean NOT NULL DEFAULT false;
