-- Find the complete UUID for a user
SELECT id, username, email, role 
FROM profiles 
WHERE email = 'student1@example.com' 
   OR username = 'student';
