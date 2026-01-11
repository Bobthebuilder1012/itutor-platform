-- Check what tutors exist in the database
SELECT 
    id,
    username,
    display_name,
    full_name,
    email,
    role,
    school,
    country
FROM public.profiles
WHERE role = 'tutor'
ORDER BY created_at DESC;

-- Check tutor_subjects relationship
SELECT 
    ts.id,
    ts.tutor_id,
    p.username as tutor_username,
    p.display_name as tutor_display_name,
    ts.subject_id,
    s.name as subject_name,
    s.label as subject_label,
    s.curriculum,
    s.level,
    ts.price_per_hour_ttd
FROM public.tutor_subjects ts
LEFT JOIN public.profiles p ON ts.tutor_id = p.id
LEFT JOIN public.subjects s ON ts.subject_id = s.id
ORDER BY p.username, s.name;

-- Count subjects per tutor
SELECT 
    p.username,
    p.display_name,
    p.full_name,
    COUNT(ts.id) as subject_count
FROM public.profiles p
LEFT JOIN public.tutor_subjects ts ON p.id = ts.tutor_id
WHERE p.role = 'tutor'
GROUP BY p.id, p.username, p.display_name, p.full_name
ORDER BY subject_count DESC;













