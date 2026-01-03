-- Check if child accounts have billing_mode set correctly
SELECT 
    id,
    email,
    full_name,
    role,
    billing_mode,
    school,
    form_level,
    created_at
FROM profiles
WHERE role = 'student'
ORDER BY created_at DESC
LIMIT 10;

-- Check parent-child links
SELECT 
    pcl.parent_id,
    p_parent.email as parent_email,
    pcl.child_id,
    p_child.email as child_email,
    p_child.billing_mode as child_billing_mode
FROM parent_child_links pcl
JOIN profiles p_parent ON pcl.parent_id = p_parent.id
JOIN profiles p_child ON pcl.child_id = p_child.id
ORDER BY pcl.created_at DESC
LIMIT 10;







