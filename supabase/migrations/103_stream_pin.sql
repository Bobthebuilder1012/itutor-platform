ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pin_expires_at timestamptz;
