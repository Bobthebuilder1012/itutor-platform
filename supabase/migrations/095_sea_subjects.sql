-- SEA (Secondary Entrance Assessment) subjects for tutor onboarding and discovery
-- Run this whole script once in Supabase → SQL. Required before SEA tutor signup works.
-- (Optional: after this, POST /api/tutor/ensure-sea-subjects can re-seed rows if SUPABASE_SERVICE_ROLE_KEY is set.)

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_curriculum_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_curriculum_check
  CHECK (curriculum IN ('CSEC', 'CAPE', 'SEA'));

-- Many databases add subjects_level_check so level is only CSEC/CAPE bands (e.g. Form 4-5, Unit 1).
-- SEA uses level = 'SEA', so that check must be removed or recreated to include 'SEA'.
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_level_check;

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS label text;

INSERT INTO public.subjects (name, label, curriculum, level, code)
SELECT v.name, v.label, v.curriculum, v.level, v.code
FROM (
  VALUES
    ('SEA Mathematics'::text, 'SEA Maths'::text, 'SEA'::text, 'SEA'::text, NULL::text),
    ('SEA English', 'SEA English', 'SEA', 'SEA', NULL),
    ('SEA Creative Writing', 'SEA Creative Writing', 'SEA', 'SEA', NULL)
) AS v(name, label, curriculum, level, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.name = v.name AND s.curriculum = v.curriculum AND s.level = v.level
);

COMMENT ON CONSTRAINT subjects_curriculum_check ON public.subjects IS 'CSEC, CAPE, and SEA curriculum subjects';
