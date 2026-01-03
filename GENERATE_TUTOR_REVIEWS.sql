-- =====================================================
-- GENERATE RANDOM RATINGS AND REVIEWS FOR TUTORS
-- =====================================================
-- This script creates realistic fake reviews for all tutors
-- Run this in your Supabase SQL Editor

DO $$
DECLARE
  student_ids UUID[];
  tutor_record RECORD;
  random_student_id UUID;
  random_stars INTEGER;
  random_comment TEXT;
  num_reviews INTEGER;
  i INTEGER;
  random_val FLOAT;
BEGIN
  -- Get all existing student IDs
  SELECT ARRAY_AGG(id) INTO student_ids
  FROM public.profiles
  WHERE role = 'student';

  -- If no students exist, we can't create reviews
  IF student_ids IS NULL OR array_length(student_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No students found in the database. Please create student accounts first.';
  END IF;

  RAISE NOTICE 'Found % students to use for reviews', array_length(student_ids, 1);

  -- Array of realistic review comments
  -- Loop through all tutors
  FOR tutor_record IN 
    SELECT id, display_name FROM public.profiles WHERE role = 'tutor'
  LOOP
    -- Generate between 3 and 12 reviews per tutor
    num_reviews := 3 + floor(random() * 10)::INTEGER;
    
    RAISE NOTICE 'Generating % reviews for tutor: %', num_reviews, tutor_record.display_name;
    
    FOR i IN 1..num_reviews LOOP
      -- Pick a random student from existing students
      random_student_id := student_ids[1 + floor(random() * array_length(student_ids, 1))::INTEGER];
      
      -- Generate random star rating (weighted towards higher ratings)
      random_val := random();
      IF random_val < 0.40 THEN 
        random_stars := 5;
      ELSIF random_val < 0.75 THEN 
        random_stars := 4;
      ELSIF random_val < 0.95 THEN 
        random_stars := 3;
      ELSE 
        random_stars := 2;
      END IF;
      
      -- Pick a random comment based on the star rating
      IF random_stars = 5 THEN
        random_comment := (ARRAY[
          'Excellent tutor! Very patient and explains concepts clearly.',
          'Really helped me improve my grades. Highly recommend!',
          'Fantastic tutor! My understanding improved significantly.',
          'Outstanding tutor with great communication skills.',
          'Couldn''t have passed my exams without this tutor!',
          'Perfect tutor for exam preparation!',
          'Makes learning fun and engaging!',
          'Very professional and always on time.'
        ])[1 + floor(random() * 8)::INTEGER];
      ELSIF random_stars = 4 THEN
        random_comment := (ARRAY[
          'Great teaching style, makes learning enjoyable.',
          'Very knowledgeable and prepared for each session.',
          'Clear explanations and good at breaking down complex topics.',
          'Very supportive and encouraging throughout.',
          'Helped boost my confidence in the subject.',
          'Great at providing real-world examples.',
          NULL  -- Some reviews have no comment
        ])[1 + floor(random() * 7)::INTEGER];
      ELSIF random_stars = 3 THEN
        random_comment := (ARRAY[
          'Patient and understanding, helped me grasp difficult topics.',
          'Helpful sessions, but sometimes hard to schedule.',
          'Good explanations, could use more practice problems.',
          NULL,
          NULL
        ])[1 + floor(random() * 5)::INTEGER];
      ELSE
        random_comment := (ARRAY[
          'Sessions were okay, but not what I expected.',
          'Had some technical issues during our lessons.',
          NULL,
          NULL
        ])[1 + floor(random() * 4)::INTEGER];
      END IF;
      
      -- Insert the rating (with conflict handling to avoid duplicates)
      BEGIN
        INSERT INTO public.ratings (
          student_id,
          tutor_id,
          stars,
          comment,
          created_at
        ) VALUES (
          random_student_id,
          tutor_record.id,
          random_stars,
          random_comment,
          NOW() - (random() * INTERVAL '90 days')  -- Random date within last 90 days
        );
      EXCEPTION WHEN unique_violation THEN
        -- If this student already reviewed this tutor, skip
        CONTINUE;
      END;
      
    END LOOP;
    
  END LOOP;
  
  RAISE NOTICE 'Review generation complete!';
END $$;

-- Display summary of generated reviews
SELECT 
  p.display_name AS tutor_name,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.stars)::NUMERIC, 2) AS average_rating,
  COUNT(CASE WHEN r.stars = 5 THEN 1 END) AS five_stars,
  COUNT(CASE WHEN r.stars = 4 THEN 1 END) AS four_stars,
  COUNT(CASE WHEN r.stars = 3 THEN 1 END) AS three_stars,
  COUNT(CASE WHEN r.stars = 2 THEN 1 END) AS two_stars,
  COUNT(CASE WHEN r.stars = 1 THEN 1 END) AS one_star
FROM public.profiles p
LEFT JOIN public.ratings r ON r.tutor_id = p.id
WHERE p.role = 'tutor'
GROUP BY p.id, p.display_name
ORDER BY total_reviews DESC, average_rating DESC;

SELECT 'Random tutor reviews generated successfully! ⭐' AS status;






