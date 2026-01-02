-- ============================================================================
-- SEED TEST USERS FOR iTUTOR PLATFORM
-- ============================================================================
-- Creates 500 test users:
-- - 125 Tutors (with subjects, rates, some verified)
-- - 350 Students (distributed across schools)
-- - 25 Parents (linked to some students)
-- 
-- All test users are tagged with is_test_data = true for easy removal
-- ============================================================================

-- Step 1: Create function to generate random email
CREATE OR REPLACE FUNCTION generate_test_email(prefix text, id integer)
RETURNS text AS $$
BEGIN
  RETURN prefix || id || '@testitutor.com';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create function to generate random username
CREATE OR REPLACE FUNCTION generate_test_username(role text, id integer)
RETURNS text AS $$
BEGIN
  RETURN role || '_test_' || id;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Add is_test_data column to profiles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_test_data BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Step 4: Arrays of realistic Caribbean data
DO $$
DECLARE
  -- Caribbean schools (some will get surplus students)
  schools text[] := ARRAY[
    'Queens Royal College',
    'St. Josephs Convent',
    'Naparima College',
    'Presentation College Chaguanas',
    'Presentation College San Fernando',
    'St. Augustines Secondary',
    'Holy Name Convent',
    'Fatima College',
    'St. Georges College',
    'Bishops High School',
    'Tranquility Government Secondary',
    'San Fernando Secondary',
    'St. Marys College',
    'Holy Cross College',
    'Malick Secondary',
    'Carapichaima East Secondary'
  ];
  
  -- Popular schools (will get 2-3x more students)
  popular_schools text[] := ARRAY[
    'Queens Royal College',
    'Naparima College',
    'St. Josephs Convent',
    'Fatima College'
  ];
  
  first_names text[] := ARRAY[
    'Aiden', 'Ava', 'Brandon', 'Brianna', 'Caleb', 'Chloe', 'Daniel', 'Destiny',
    'Ethan', 'Emma', 'Gabriel', 'Grace', 'Isaiah', 'Isabella', 'Jayden', 'Jasmine',
    'Joshua', 'Kayla', 'Liam', 'Leah', 'Marcus', 'Maya', 'Nathan', 'Nicole',
    'Ryan', 'Rachel', 'Samuel', 'Sarah', 'Tyler', 'Taylor', 'Zion', 'Zara',
    'Khalil', 'Khadija', 'Malik', 'Mia', 'Omar', 'Olivia', 'Rashad', 'Rihanna',
    'Jamal', 'Jade', 'Tyrese', 'Tiana', 'Andre', 'Alicia', 'Devon', 'Diana',
    'Kevin', 'Kimberly', 'Aaron', 'Amara', 'Curtis', 'Crystal', 'Derek', 'Danielle'
  ];
  
  last_names text[] := ARRAY[
    'Mohammed', 'Singh', 'Williams', 'Khan', 'Joseph', 'Smith', 'Ali', 'Baptiste',
    'Ramsey', 'Garcia', 'Brown', 'Rodriguez', 'Persad', 'Charles', 'Maraj', 'Thomas',
    'Roberts', 'George', 'Alexander', 'Mitchell', 'Phillips', 'Campbell', 'Wilson',
    'Richardson', 'Henry', 'Edwards', 'Martin', 'James', 'Samuel', 'Benjamin',
    'Lewis', 'Walker', 'Robinson', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clarke'
  ];
  
  -- CSEC/CAPE subjects (will be queried from subjects table)
  subject_ids UUID[];
  subject_names text[] := ARRAY[
    'Mathematics',
    'English Language',
    'English Literature',
    'Biology',
    'Chemistry',
    'Physics',
    'Spanish',
    'French',
    'Geography',
    'History',
    'Information Technology',
    'Principles of Accounts',
    'Principles of Business',
    'Economics',
    'Social Studies',
    'Integrated Science',
    'Human and Social Biology',
    'Agricultural Science',
    'Technical Drawing',
    'Food and Nutrition'
  ];
  
  i INTEGER;
  tutor_count INTEGER := 0;
  student_count INTEGER := 0;
  parent_count INTEGER := 0;
  
  rand_first TEXT;
  rand_last TEXT;
  rand_school TEXT;
  rand_form INTEGER;
  rand_bio TEXT;
  rand_rate NUMERIC;
  is_verified BOOLEAN;
  num_subjects INTEGER;
  selected_subject_ids UUID[];
  current_subject_id UUID;
  test_user_id UUID;
  
BEGIN
  RAISE NOTICE 'Starting test user generation...';
  
  -- ============================================================================
  -- GET SUBJECT IDS FROM SUBJECTS TABLE
  -- ============================================================================
  SELECT array_agg(id) INTO subject_ids FROM subjects LIMIT 20;
  
  IF subject_ids IS NULL OR array_length(subject_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No subjects found in subjects table. Please seed subjects first.';
  END IF;
  
  RAISE NOTICE 'Found % subjects in database', array_length(subject_ids, 1);
  
  -- ============================================================================
  -- CREATE 125 TUTORS
  -- ============================================================================
  RAISE NOTICE 'Creating 125 tutors...';
  
  FOR i IN 1..125 LOOP
    -- Generate random tutor data
    rand_first := first_names[1 + floor(random() * array_length(first_names, 1))];
    rand_last := last_names[1 + floor(random() * array_length(last_names, 1))];
    rand_school := schools[1 + floor(random() * array_length(schools, 1))];
    rand_form := 4 + floor(random() * 3); -- Forms 4-6
    rand_rate := 25 + (random() * 75)::INTEGER; -- $25-$100/hr
    is_verified := random() < 0.3; -- 30% verified
    num_subjects := 1 + floor(random() * 4); -- 1-4 subjects
    
    rand_bio := 'Experienced ' || rand_school || ' tutor specializing in CSEC and CAPE. Passionate about helping students achieve their academic goals.';
    
    -- Insert tutor profile
    INSERT INTO profiles (
      id,
      username,
      full_name,
      email,
      role,
      school,
      form_level,
      bio,
      is_test_data,
      created_at
    ) VALUES (
      gen_random_uuid(),
      generate_test_username('tutor', i),
      rand_first || ' ' || rand_last,
      generate_test_email('tutor', i),
      'tutor',
      rand_school,
      'Form ' || rand_form,
      rand_bio,
      true,
      NOW() - (random() * interval '90 days')
    )
    RETURNING id INTO test_user_id;
    
    -- Select random subject IDs
    selected_subject_ids := ARRAY(
      SELECT subject_ids[1 + floor(random() * array_length(subject_ids, 1))]
      FROM generate_series(1, num_subjects)
    );
    
    -- Add subjects to tutor
    FOR j IN 1..array_length(selected_subject_ids, 1) LOOP
      current_subject_id := selected_subject_ids[j];
      
      -- Insert into tutor_subjects
      INSERT INTO tutor_subjects (
        tutor_id,
        subject_id,
        price_per_hour_ttd,
        mode,
        created_at
      ) VALUES (
        test_user_id,
        current_subject_id,
        rand_rate,
        'online',
        NOW() - (random() * interval '60 days')
      )
      ON CONFLICT (tutor_id, subject_id) DO NOTHING;
      
      -- Add verification for verified tutors (random grade 1-3 for CSEC)
      IF is_verified THEN
        INSERT INTO tutor_verified_subjects (
          tutor_id,
          subject_id,
          exam_type,
          grade,
          is_public,
          verified_at,
          created_at
        ) VALUES (
          test_user_id,
          current_subject_id,
          'CSEC',
          1 + floor(random() * 3),  -- Grades 1, 2, or 3
          true,
          NOW() - (random() * interval '30 days'),
          NOW() - (random() * interval '30 days')
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
    
    tutor_count := tutor_count + 1;
    
    IF i % 25 = 0 THEN
      RAISE NOTICE '  Created % tutors...', i;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Completed: % tutors created', tutor_count;
  
  -- ============================================================================
  -- CREATE 350 STUDENTS (with surplus in popular schools)
  -- ============================================================================
  RAISE NOTICE 'Creating 350 students...';
  
  FOR i IN 1..350 LOOP
    -- Generate random student data
    rand_first := first_names[1 + floor(random() * array_length(first_names, 1))];
    rand_last := last_names[1 + floor(random() * array_length(last_names, 1))];
    rand_form := 1 + floor(random() * 6); -- Forms 1-6
    
    -- 50% chance to be from popular school (creates surplus)
    IF random() < 0.5 THEN
      rand_school := popular_schools[1 + floor(random() * array_length(popular_schools, 1))];
    ELSE
      rand_school := schools[1 + floor(random() * array_length(schools, 1))];
    END IF;
    
    rand_bio := 'Form ' || rand_form || ' student at ' || rand_school || '. Looking for help with CSEC/CAPE subjects.';
    
    -- Insert student profile
    INSERT INTO profiles (
      id,
      username,
      full_name,
      email,
      role,
      school,
      form_level,
      bio,
      is_test_data,
      created_at
    ) VALUES (
      gen_random_uuid(),
      generate_test_username('student', i),
      rand_first || ' ' || rand_last,
      generate_test_email('student', i),
      'student',
      rand_school,
      'Form ' || rand_form,
      rand_bio,
      true,
      NOW() - (random() * interval '120 days')
    );
    
    student_count := student_count + 1;
    
    IF i % 50 = 0 THEN
      RAISE NOTICE '  Created % students...', i;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Completed: % students created', student_count;
  
  -- ============================================================================
  -- CREATE 25 PARENTS
  -- ============================================================================
  RAISE NOTICE 'Creating 25 parents...';
  
  FOR i IN 1..25 LOOP
    -- Generate random parent data
    rand_first := first_names[1 + floor(random() * array_length(first_names, 1))];
    rand_last := last_names[1 + floor(random() * array_length(last_names, 1))];
    
    rand_bio := 'Parent seeking quality tutoring for my child. Value education and academic excellence.';
    
    -- Insert parent profile
    INSERT INTO profiles (
      id,
      username,
      full_name,
      email,
      role,
      bio,
      is_test_data,
      created_at
    ) VALUES (
      gen_random_uuid(),
      generate_test_username('parent', i),
      rand_first || ' ' || rand_last,
      generate_test_email('parent', i),
      'parent',
      rand_bio,
      true,
      NOW() - (random() * interval '180 days')
    );
    
    parent_count := parent_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Completed: % parents created', parent_count;
  
  -- ============================================================================
  -- SUMMARY
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DATA GENERATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total Users Created: %', tutor_count + student_count + parent_count;
  RAISE NOTICE '  - Tutors: %', tutor_count;
  RAISE NOTICE '  - Students: %', student_count;
  RAISE NOTICE '  - Parents: %', parent_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Distribution:';
  RAISE NOTICE '  - Verified Tutors: ~30%%';
  RAISE NOTICE '  - Popular Schools: Queens Royal, Naparima, St. Josephs, Fatima';
  RAISE NOTICE '  - All users tagged with is_test_data = true';
  RAISE NOTICE '========================================';
  
END $$;

-- Create index on is_test_data for faster cleanup
CREATE INDEX IF NOT EXISTS idx_profiles_is_test_data ON profiles(is_test_data);

-- Display sample of created data
SELECT 
  role,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE school IN ('Queens Royal College', 'Naparima College', 'St. Josephs Convent', 'Fatima College')) as in_popular_schools
FROM profiles
WHERE is_test_data = true
GROUP BY role
ORDER BY role;

-- Display tutor subject distribution
SELECT 
  s.name as subject_name,
  COUNT(DISTINCT ts.tutor_id) as tutor_count,
  COUNT(DISTINCT tvs.id) as verified_count,
  CONCAT('$', ROUND(AVG(ts.price_per_hour_ttd), 2)) as avg_rate
FROM tutor_subjects ts
JOIN subjects s ON ts.subject_id = s.id
LEFT JOIN tutor_verified_subjects tvs ON ts.tutor_id = tvs.tutor_id AND ts.subject_id = tvs.subject_id
JOIN profiles p ON ts.tutor_id = p.id
WHERE p.is_test_data = true
GROUP BY s.name
ORDER BY tutor_count DESC
LIMIT 10;

-- Final cleanup notice
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'To remove all test data, run:';
  RAISE NOTICE 'DELETE FROM profiles WHERE is_test_data = true;';
  RAISE NOTICE '========================================';
END $$;

