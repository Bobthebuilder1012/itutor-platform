-- Store the levels a tutor selected during onboarding.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teaching_levels text[] DEFAULT ARRAY[]::text[];

UPDATE public.profiles
SET teaching_levels = ARRAY[]::text[]
WHERE teaching_levels IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN teaching_levels SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN teaching_levels SET NOT NULL;

COMMENT ON COLUMN public.profiles.teaching_levels IS 'Teaching levels selected by tutors during onboarding.';

NOTIFY pgrst, 'reload schema';
