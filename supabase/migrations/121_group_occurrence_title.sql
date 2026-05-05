-- Add per-occurrence title override so individual sessions in a series
-- can be renamed independently. NULL means "inherit from parent series".

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS title text;
