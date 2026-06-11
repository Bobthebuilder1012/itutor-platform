-- Add CAPE Information Technology (Unit 1 & Unit 2) which was missing from the initial seed
INSERT INTO public.subjects (name, label, curriculum, level, code)
SELECT v.name, v.label, v.curriculum, v.level, v.code
FROM (
  VALUES
    ('Information Technology Unit 1'::text, 'CAPE Information Technology Unit 1'::text, 'CAPE'::text, 'Unit 1'::text, 'CAPIT1'::text),
    ('Information Technology Unit 2'::text, 'CAPE Information Technology Unit 2'::text, 'CAPE'::text, 'Unit 2'::text, 'CAPIT2'::text)
) AS v(name, label, curriculum, level, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.name = v.name AND s.curriculum = v.curriculum AND s.level = v.level
);
