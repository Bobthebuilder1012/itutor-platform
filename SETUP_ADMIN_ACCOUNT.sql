-- Setup admin account for admin@myitutor.com
-- Run this SQL in Supabase SQL Editor

-- 1. First, check if the admin user exists
SELECT id, email, role 
FROM profiles 
WHERE email = 'admin@myitutor.com';

-- 2. If the user exists, update their role to 'admin'
UPDATE profiles 
SET role = 'admin'
WHERE email = 'admin@myitutor.com';

-- 3. Verify the update
SELECT id, email, role, full_name, display_name, created_at
FROM profiles 
WHERE email = 'admin@myitutor.com';

-- 4. If the admin user doesn't exist, you need to:
--    a) Sign up at /signup with email: admin@myitutor.com
--    b) Then run the UPDATE statement above to change role to 'admin'

-- Note: After setting role to 'admin', log out and log back in
-- to refresh the session and access admin features
