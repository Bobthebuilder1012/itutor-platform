-- Simple check: Do tutors exist?
SELECT COUNT(*) as tutor_count
FROM public.profiles
WHERE role = 'tutor';

-- Do they have usernames now?
SELECT 
    COUNT(*) as total_tutors,
    COUNT(username) as tutors_with_username,
    COUNT(display_name) as tutors_with_display_name
FROM public.profiles
WHERE role = 'tutor';

-- Do tutors have subjects?
SELECT 
    p.username,
    p.display_name,
    p.email,
    COUNT(ts.id) as subject_count
FROM public.profiles p
LEFT JOIN public.tutor_subjects ts ON p.id = ts.tutor_id
WHERE p.role = 'tutor'
GROUP BY p.id, p.username, p.display_name, p.email;

-- Check RLS policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles';








