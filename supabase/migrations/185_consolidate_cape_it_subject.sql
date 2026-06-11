-- Remove the split Unit 1 / Unit 2 entries added in migration 182
DELETE FROM public.subjects
WHERE curriculum = 'CAPE'
  AND name IN ('Information Technology Unit 1', 'Information Technology Unit 2');

-- Insert the single consolidated entry if it doesn't already exist
INSERT INTO public.subjects (name, label, curriculum, level, code)
VALUES ('Information Technology', 'CAPE Information Technology', 'CAPE', 'Unit 1', 'CAPIT')
ON CONFLICT DO NOTHING;
