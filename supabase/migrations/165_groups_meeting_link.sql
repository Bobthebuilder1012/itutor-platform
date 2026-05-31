-- Add a reusable meeting link (Google Meet / Zoom) per class
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;
