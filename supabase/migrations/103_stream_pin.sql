ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
