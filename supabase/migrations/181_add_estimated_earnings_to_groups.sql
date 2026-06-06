-- Add estimated_earnings to groups table if not present.
-- Populated by the application when subscription payments are created.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS estimated_earnings numeric(10,2) NOT NULL DEFAULT 0;
