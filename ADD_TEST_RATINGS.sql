-- =====================================================
-- ADD RANDOM TEST RATINGS TO ALL TUTORS
-- =====================================================
-- PREREQUISITES: Run migration 050_add_test_data_flags.sql first!
-- This script adds:
-- - Random ratings (3-5 stars) to all tutors
-- - Engaging bios to tutor profiles (15 unique options)
-- - Student comments on ratings (30 different options, 95% have comments)
-- - Booking notes from students (10 different options, 80% have notes)
-- Run CLEANUP_TEST_RATINGS.sql to remove them
-- =====================================================

DO $$
DECLARE
  tutor_record RECORD;
  student_record RECORD;
  random_subject_id UUID;
  fake_booking_id UUID;
  fake_session_id UUID;
  num_ratings INTEGER;
  rating_stars INTEGER;
  rating_comment TEXT;
  booking_note TEXT;
  session_date TIMESTAMPTZ;
  tutor_bio TEXT;
  
  rating_comment_options TEXT[] := ARRAY[
    'Great tutor! Very helpful and patient.',
    'Excellent explanation of concepts.',
    'Really knows the subject well.',
    'Made learning enjoyable.',
    'Highly recommend!',
    'Very professional and punctual.',
    'Helped me improve my grades significantly.',
    'Clear and easy to understand.',
    'Patient and encouraging.',
    'Best tutor I''ve had!',
    'Would definitely book again.',
    'Fantastic session!',
    'Very knowledgeable.',
    'Made difficult topics easy to grasp.',
    'Amazing tutor!',
    'Explains things in a way that makes sense.',
    'Really cares about student success.',
    'Goes above and beyond to help.',
        'Makes complex topics simple.',
    'Super responsive and helpful!',
    'My grades improved so much after sessions with this tutor!',
    'Finally understand topics I was struggling with for months.',
    'This tutor makes learning fun and engaging.',
    'Always prepared and organized for each session.',
    'Helped me ace my exam! Thank you!',
    'Perfect tutor for CSEC preparation.',
    'Very approachable and easy to communicate with.',
    'Breaks down complicated topics into simple steps.',
    'Gave me confidence in my abilities.',
    'Best investment in my education!'
  ];
  
  booking_note_options TEXT[] := ARRAY[
    'Need help preparing for upcoming exam',
    'Struggling with homework assignments',
    'Want to improve my understanding of key concepts',
    'Looking for exam preparation tips',
    'Need help with past papers',
    'Want to review difficult topics',
    'Preparing for CSEC exams',
    'Need clarification on recent lessons',
    'Looking to improve my grades',
    'Want extra practice problems'
  ];
  
  tutor_bio_options TEXT[] := ARRAY[
    'Passionate educator with 5+ years of experience helping students excel in their studies. I believe every student can succeed with the right guidance and support. Let''s work together to achieve your academic goals!',
    'Former CSEC top performer now dedicated to helping students reach their full potential. I specialize in breaking down complex concepts into easy-to-understand lessons. Patient, friendly, and results-driven!',
    'Experienced tutor committed to making learning enjoyable and effective. I use real-world examples and interactive methods to ensure concepts stick. Your success is my priority!',
    'University student with straight A''s in CSEC/CAPE, passionate about sharing knowledge. I understand the challenges students face because I''ve been there. Let me help you overcome them!',
    'Dedicated tutor who loves seeing students have "aha!" moments. I create a comfortable learning environment where questions are encouraged. Together, we''ll build your confidence and skills!',
    'Results-oriented tutor with a track record of helping students improve their grades. I tailor my teaching style to match your learning needs. Let''s make your academic goals a reality!',
    'Friendly and approachable tutor who makes learning fun! I believe in building strong foundations and developing critical thinking skills. Ready to help you succeed!',
    'Experienced educator passionate about student success. I use proven teaching methods and provide plenty of practice materials. Let''s work together to ace those exams!',
    'Patient tutor who explains concepts clearly and thoroughly. I''m here to support you every step of the way. No question is too small - let''s learn together!',
    'Enthusiastic tutor dedicated to helping students build confidence in their abilities. I provide structured lessons with plenty of examples and practice. Your success story starts here!',
    'Current university student majoring in my subject area. I scored top marks in CSEC and CAPE and know exactly what it takes to succeed. Let me share my study strategies and exam tips with you!',
    'Professional tutor with a passion for making difficult subjects accessible to everyone. I focus on building understanding, not just memorization. My students consistently see grade improvements!',
    'Experienced in tutoring students of all levels, from beginners to advanced. I create personalized lesson plans based on your specific needs and learning pace. Book a session and see the difference!',
    'Former teacher now offering private tutoring to give students the individual attention they deserve. I specialize in exam preparation and homework help. Your success is my mission!',
    'Hi! I''m a friendly tutor who genuinely enjoys teaching and watching students grow. I use interactive methods and real-world applications to make learning relevant and engaging. Let''s achieve your goals together!'
  ];
  
BEGIN
  RAISE NOTICE '🎲 Starting to add test data...';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Step 1: Adding engaging bios to tutor profiles...';
  
  -- Add bios to all tutors without one
  FOR tutor_record IN 
    SELECT id, username, display_name, full_name
    FROM profiles
    WHERE role = 'tutor' AND (bio IS NULL OR bio = '')
  LOOP
    tutor_bio := tutor_bio_options[1 + FLOOR(RANDOM() * array_length(tutor_bio_options, 1))];
    
    UPDATE profiles
    SET bio = tutor_bio
    WHERE id = tutor_record.id;
    
    RAISE NOTICE '  ✓ Added bio for: %', COALESCE(tutor_record.display_name, tutor_record.full_name, tutor_record.username);
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '⭐ Step 2: Adding ratings and bookings...';
  RAISE NOTICE '';

  -- Loop through all tutors
  FOR tutor_record IN 
    SELECT id, username, display_name, full_name
    FROM profiles
    WHERE role = 'tutor'
  LOOP
    -- Generate 3-10 random ratings per tutor
    num_ratings := (3 + FLOOR(RANDOM() * 8))::INTEGER;
    
    RAISE NOTICE '  Adding % ratings for tutor: %', num_ratings, COALESCE(tutor_record.display_name, tutor_record.full_name, tutor_record.username);
    
    -- Get some random students to assign as reviewers
    FOR student_record IN 
      SELECT id
      FROM profiles
      WHERE role = 'student'
      ORDER BY RANDOM()
      LIMIT num_ratings
    LOOP
      -- Get a random subject
      SELECT id INTO random_subject_id
      FROM subjects
      ORDER BY RANDOM()
      LIMIT 1;
      
      -- Generate IDs
      fake_booking_id := gen_random_uuid();
      fake_session_id := gen_random_uuid();
      session_date := NOW() - (RANDOM() * INTERVAL '90 days');
      
      -- Pick a random booking note (80% of the time)
      IF RANDOM() > 0.2 THEN
        booking_note := booking_note_options[1 + FLOOR(RANDOM() * array_length(booking_note_options, 1))];
      ELSE
        booking_note := NULL;
      END IF;
      
      -- Create a fake booking first (sessions require bookings)
      INSERT INTO bookings (
        id,
        student_id,
        tutor_id,
        subject_id,
        requested_start_at,
        requested_end_at,
        confirmed_start_at,
        confirmed_end_at,
        status,
        price_ttd,
        student_notes,
        created_at,
        updated_at,
        is_test_data
      ) VALUES (
        fake_booking_id,
        student_record.id,
        tutor_record.id,
        random_subject_id,
        session_date,
        session_date + INTERVAL '1 hour',
        session_date,
        session_date + INTERVAL '1 hour',
        'CONFIRMED',
        150.00,
        booking_note,
        session_date - INTERVAL '1 day',
        session_date - INTERVAL '1 day',
        true
      );
      
      -- Create a fake session
      INSERT INTO sessions (
        id,
        booking_id,
        tutor_id,
        student_id,
        provider,
        scheduled_start_at,
        scheduled_end_at,
        duration_minutes,
        no_show_wait_minutes,
        min_payable_minutes,
        status,
        charge_scheduled_at,
        charge_amount_ttd,
        payout_amount_ttd,
        platform_fee_ttd,
        created_at,
        updated_at,
        is_test_data
      ) VALUES (
        fake_session_id,
        fake_booking_id,
        tutor_record.id,
        student_record.id,
        'google_meet',
        session_date,
        session_date + INTERVAL '1 hour',
        60,
        10,
        30,
        'COMPLETED_ASSUMED',
        session_date + INTERVAL '1 hour',
        150.00,
        127.50, -- 85% payout
        22.50,  -- 15% platform fee
        session_date,
        session_date + INTERVAL '1 hour',
        true
      );
      
      -- Generate random rating between 3 and 5 stars
      rating_stars := (3 + FLOOR(RANDOM() * 3))::INTEGER;
      
      -- Pick a random comment (95% of the time - almost all have comments)
      IF RANDOM() > 0.05 THEN
        rating_comment := rating_comment_options[1 + FLOOR(RANDOM() * array_length(rating_comment_options, 1))];
      ELSE
        rating_comment := NULL;
      END IF;
      
      -- Insert the rating
      INSERT INTO ratings (
        session_id,
        tutor_id,
        student_id,
        stars,
        comment,
        created_at,
        is_test_data
      ) VALUES (
        fake_session_id,
        tutor_record.id,
        student_record.id,
        rating_stars,
        rating_comment,
        session_date + INTERVAL '1 hour 5 minutes',
        true
      );
    END LOOP;
  END LOOP;

  -- Final summary
  DECLARE
    tutor_bio_count INTEGER;
    booking_count INTEGER;
    session_count INTEGER;
    rating_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO tutor_bio_count FROM profiles WHERE role = 'tutor' AND bio IS NOT NULL AND bio != '';
    SELECT COUNT(*) INTO booking_count FROM bookings WHERE is_test_data = true;
    SELECT COUNT(*) INTO session_count FROM sessions WHERE is_test_data = true;
    SELECT COUNT(*) INTO rating_count FROM ratings WHERE is_test_data = true;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Test data added successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Summary:';
    RAISE NOTICE '   Tutors with bios: %', tutor_bio_count;
    RAISE NOTICE '   Total test bookings: %', booking_count;
    RAISE NOTICE '   Total test sessions: %', session_count;
    RAISE NOTICE '   Total test ratings: %', rating_count;
    RAISE NOTICE '';
    RAISE NOTICE '🧹 To remove test data (keeps bios), run: CLEANUP_TEST_RATINGS.sql';
    RAISE NOTICE '💡 Note: Tutor bios are permanent and won''t be removed by cleanup';
  END;
END $$;
