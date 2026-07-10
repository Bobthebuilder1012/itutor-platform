DO $$
DECLARE
  tutor UUID := 'd17d0afc-cedf-4129-86ee-aba60b6203df';
  s1 UUID := '02acdc38-108d-4a79-a61c-8e62e21aed81';
  s2 UUID := '2bb6f1c7-56f8-49d0-8e09-bc7b33c81d8e';
  s3 UUID := 'afc4f533-1a0b-456a-8b86-02e09bb1cfc0';
  s4 UUID := 'b1792e21-2a92-4438-a079-34675746b80a';
  s5 UUID := 'a2d0f71a-9d17-4a4c-b631-ed449a93e22a';
  g_algebra UUID;
  g_writing UUID;
  g_science UUID;
  g_history UUID;
  g_sea UUID;
  sess_algebra UUID;
  sess_writing UUID;
  sess_science UUID;
  sess_history UUID;
  sess_sea_weekly UUID;
  sess_sea_extra UUID;
BEGIN
  g_algebra     := gen_random_uuid();
  g_writing     := gen_random_uuid();
  g_science     := gen_random_uuid();
  g_history     := gen_random_uuid();
  g_sea         := gen_random_uuid();

  INSERT INTO public.groups
    (id, name, description, tutor_id, subject, pricing, pricing_model, price_monthly,
     max_students, form_level, visibility, require_join_requests,
     auto_suspend_missed_payment, grace_period_days, feedback_mode,
     estimated_earnings, status, recurrence_type, timezone)
  VALUES
    (g_algebra, 'Algebra Foundations',
     'Master CSEC Mathematics from first principles. We cover algebra, quadratics, and number theory with weekly problem sets and exam drills.',
     tutor, 'Mathematics', 'free', 'MONTHLY', 140.00, 15, 'CSEC (14–16)', 'public', false, false, 7, 'off', 318.00, 'PUBLISHED', 'NONE', 'UTC'),
    (g_writing, 'Creative Writing Club',
     'Develop your voice and conquer CSEC English writing. Weekly sessions on composition, comprehension, and literature analysis.',
     tutor, 'English A', 'free', 'MONTHLY', 155.00, 12, 'CSEC (14–16)', 'public', false, false, 7, 'off', 312.00, 'PUBLISHED', 'NONE', 'UTC'),
    (g_science, 'Junior Science Lab',
     'Hands-on virtual science experiments and theory for CSEC Integrated Science. Covers biology, chemistry, and physics basics.',
     tutor, 'Integrated Science', 'free', 'MONTHLY', 120.00, 18, 'CSEC (14–16)', 'public', false, false, 7, 'off', 285.00, 'PUBLISHED', 'NONE', 'UTC'),
    (g_history, 'Caribbean History Prep',
     'Deep dives into Caribbean History from colonisation to independence. Structured essay writing and source analysis for CSEC success.',
     tutor, 'History', 'free', 'MONTHLY', 125.00, 15, 'CSEC (14–16)', 'public', false, false, 7, 'off', 300.00, 'PUBLISHED', 'NONE', 'UTC'),
    (g_sea, 'SEA Exam Strategy Group',
     'Targeted SEA preparation with timed practice papers, maths drills, and English comprehension strategies for Primary 5 & 6 students.',
     tutor, 'Mathematics', 'free', 'MONTHLY', 130.00, 10, 'SEA (10–12)', 'public', false, false, 7, 'off', 297.00, 'PUBLISHED', 'NONE', 'UTC');

  sess_algebra     := gen_random_uuid();
  sess_writing     := gen_random_uuid();
  sess_science     := gen_random_uuid();
  sess_history     := gen_random_uuid();
  sess_sea_weekly  := gen_random_uuid();
  sess_sea_extra   := gen_random_uuid();

  INSERT INTO public.group_sessions
    (id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on)
  VALUES
    (sess_algebra,    g_algebra, 'Algebra Foundations — Weekly Session',    'weekly', ARRAY[1],          '16:00:00', 60, '2026-05-16'),
    (sess_writing,    g_writing, 'Creative Writing Club — Weekly Session',   'weekly', ARRAY[2],          '15:00:00', 60, '2026-05-16'),
    (sess_science,    g_science, 'Junior Science Lab — Weekly Session',      'weekly', ARRAY[3],          '17:00:00', 60, '2026-05-16'),
    (sess_history,    g_history, 'Caribbean History Prep — Weekly Session',  'weekly', ARRAY[4],          '16:00:00', 60, '2026-05-16'),
    (sess_sea_weekly, g_sea,     'SEA Exam Strategy Group — Weekly Session', 'weekly', ARRAY[6],          '09:00:00', 60, '2026-05-16'),
    (sess_sea_extra,  g_sea,     'Session — Sat, Jun 13',                   'none',   ARRAY[]::integer[], '16:00:00', 60, '2026-06-13');

  INSERT INTO public.group_session_occurrences
    (id, group_session_id, scheduled_start_at, scheduled_end_at, status)
  VALUES
    (gen_random_uuid(), sess_sea_weekly,  '2026-05-16 09:00:00+00', '2026-05-16 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_weekly,  '2026-05-23 09:00:00+00', '2026-05-23 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_weekly,  '2026-05-30 09:00:00+00', '2026-05-30 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_weekly,  '2026-06-13 09:00:00+00', '2026-06-13 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_weekly,  '2026-06-20 09:00:00+00', '2026-06-20 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_weekly,  '2026-06-27 09:00:00+00', '2026-06-27 10:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_sea_extra,   '2026-06-13 12:00:00+00', '2026-06-13 13:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-05-16 15:00:00+00', '2026-05-16 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-05-23 15:00:00+00', '2026-05-23 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-05-30 15:00:00+00', '2026-05-30 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-06-13 15:00:00+00', '2026-06-13 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-06-20 15:00:00+00', '2026-06-20 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_writing,     '2026-06-27 15:00:00+00', '2026-06-27 16:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-05-16 16:00:00+00', '2026-05-16 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-05-23 16:00:00+00', '2026-05-23 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-05-30 16:00:00+00', '2026-05-30 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-06-13 16:00:00+00', '2026-06-13 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-06-20 16:00:00+00', '2026-06-20 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_algebra,     '2026-06-27 16:00:00+00', '2026-06-27 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-05-16 16:00:00+00', '2026-05-16 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-05-23 16:00:00+00', '2026-05-23 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-05-30 16:00:00+00', '2026-05-30 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-06-13 16:00:00+00', '2026-06-13 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-06-20 16:00:00+00', '2026-06-20 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_history,     '2026-06-27 16:00:00+00', '2026-06-27 17:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-05-16 17:00:00+00', '2026-05-16 18:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-05-23 17:00:00+00', '2026-05-23 18:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-05-30 17:00:00+00', '2026-05-30 18:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-06-13 17:00:00+00', '2026-06-13 18:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-06-20 17:00:00+00', '2026-06-20 18:00:00+00', 'upcoming'),
    (gen_random_uuid(), sess_science,     '2026-06-27 17:00:00+00', '2026-06-27 18:00:00+00', 'upcoming');

  INSERT INTO public.group_members (id, group_id, user_id, status, joined_at)
  VALUES
    (gen_random_uuid(), g_algebra, s1, 'approved', '2026-05-23 17:56:02+00'),
    (gen_random_uuid(), g_algebra, s2, 'approved', '2026-05-23 17:56:02+00'),
    (gen_random_uuid(), g_algebra, s3, 'approved', '2026-05-23 17:56:02+00'),
    (gen_random_uuid(), g_writing, s4, 'approved', '2026-05-23 17:56:03+00'),
    (gen_random_uuid(), g_writing, s5, 'approved', '2026-05-23 17:56:03+00'),
    (gen_random_uuid(), g_writing, s1, 'approved', '2026-05-23 17:56:03+00'),
    (gen_random_uuid(), g_science, s2, 'approved', '2026-05-23 17:56:04+00'),
    (gen_random_uuid(), g_science, s3, 'approved', '2026-05-23 17:56:04+00'),
    (gen_random_uuid(), g_science, s4, 'approved', '2026-05-23 17:56:04+00'),
    (gen_random_uuid(), g_history, s5, 'approved', '2026-05-23 17:56:06+00'),
    (gen_random_uuid(), g_history, s1, 'approved', '2026-05-23 17:56:06+00'),
    (gen_random_uuid(), g_history, s2, 'approved', '2026-05-23 17:56:06+00'),
    (gen_random_uuid(), g_sea,     s3, 'approved', '2026-05-23 17:56:07+00'),
    (gen_random_uuid(), g_sea,     s4, 'approved', '2026-05-23 17:56:07+00'),
    (gen_random_uuid(), g_sea,     s5, 'approved', '2026-05-23 17:56:07+00');
END $$;
