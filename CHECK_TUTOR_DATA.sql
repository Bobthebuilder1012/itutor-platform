-- Run this to check if your tutor has any subjects in the database
-- Replace 'YOUR_TUTOR_ID' with the actual tutor ID from the console

-- 1. Check if tutor exists in profiles
SELECT id, full_name, role, school 
FROM public.profiles 
WHERE role = 'tutor';

-- 2. Check if there are ANY records in tutor_subjects
SELECT COUNT(*) as total_tutor_subjects 
FROM public.tutor_subjects;

-- 3. Check subjects for a specific tutor (replace the ID)
-- Get the tutor ID from step 1 above
SELECT 
    ts.id,
    ts.tutor_id,
    ts.subject_id,
    ts.price_per_hour_ttd,
    ts.mode,
    s.name as subject_name,
    s.curriculum,
    s.level
FROM public.tutor_subjects ts
LEFT JOIN public.subjects s ON s.id = ts.subject_id
WHERE ts.tutor_id = 'YOUR_TUTOR_ID_HERE';  -- Replace with actual tutor ID

-- 4. Check if subjects table has data
SELECT COUNT(*) as total_subjects 
FROM public.subjects;

-- 5. List all subjects available
SELECT id, name, curriculum, level 
FROM public.subjects 
ORDER BY curriculum, name
LIMIT 20;









