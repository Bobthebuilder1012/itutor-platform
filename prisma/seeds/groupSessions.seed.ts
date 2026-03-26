import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function seed() {
  const now = new Date();

  const tutorId = '00000000-0000-0000-0000-000000000101';
  const studentA = '00000000-0000-0000-0000-000000000201';
  const studentB = '00000000-0000-0000-0000-000000000202';

  await supabase.from('profiles').upsert(
    [
      { id: tutorId, full_name: 'Seed Tutor', role: 'tutor' },
      { id: studentA, full_name: 'Seed Student A', role: 'student' },
      { id: studentB, full_name: 'Seed Student B', role: 'student' },
    ],
    { onConflict: 'id' }
  );

  const { data: group } = await supabase
    .from('groups')
    .upsert(
      {
        id: '00000000-0000-0000-0000-000000001001',
        tutor_id: tutorId,
        name: 'CSEC Math Mastery Group',
        subject: 'Mathematics',
        description: 'Exam-focused weekly sessions with past paper drills.',
        status: 'PUBLISHED',
        pricing_model: 'SUBSCRIPTION',
        price_monthly: 120,
        timezone: 'America/Port_of_Spain',
        max_students: 30,
        content_blocks: [
          { type: 'paragraph', text: 'Topic drills and exam strategy each week.' },
          { type: 'bullet_list', items: ['Algebra', 'Functions', 'Geometry', 'Past papers'] },
        ],
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single();

  if (!group) throw new Error('Failed to upsert group');

  const { data: session } = await supabase
    .from('group_sessions')
    .upsert(
      {
        id: '00000000-0000-0000-0000-000000002001',
        group_id: group.id,
        title: 'Weekly Math Session',
        recurrence_type: 'weekly',
        recurrence_days: [2, 4],
        start_time: '18:00:00',
        duration_minutes: 90,
        starts_on: now.toISOString().slice(0, 10),
        meeting_platform: 'GOOGLE_MEET',
        timezone: 'America/Port_of_Spain',
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single();

  if (!session) throw new Error('Failed to upsert session');

  const occurrences = [3, 6, 10].map((dayOffset, idx) => {
    const start = addDays(now, dayOffset);
    start.setHours(18, 0, 0, 0);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    return {
      id: `00000000-0000-0000-0000-00000000300${idx + 1}`,
      group_session_id: session.id,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
      status: 'upcoming',
      occurrence_index: idx,
      meeting_platform: 'GOOGLE_MEET',
      meeting_link: `https://meet.google.com/seed-${idx + 1}`,
      timezone: 'America/Port_of_Spain',
    };
  });

  await supabase.from('group_session_occurrences').upsert(occurrences, { onConflict: 'id' });

  await supabase.from('group_enrollments').upsert(
    [
      {
        student_id: studentA,
        group_id: group.id,
        enrollment_type: 'SUBSCRIPTION',
        status: 'ACTIVE',
        payment_status: 'PAID',
      },
      {
        student_id: studentB,
        group_id: group.id,
        enrollment_type: 'SUBSCRIPTION',
        status: 'ACTIVE',
        payment_status: 'PAID',
      },
    ],
    { onConflict: 'student_id,group_id,session_id' }
  );

  await supabase.from('group_attendance_records').upsert(
    [
      {
        session_id: session.id,
        student_id: studentA,
        status: 'PRESENT',
        marked_by_id: tutorId,
      },
      {
        session_id: session.id,
        student_id: studentB,
        status: 'PRESENT',
        marked_by_id: tutorId,
      },
    ],
    { onConflict: 'session_id,student_id' }
  );

  await supabase.from('group_reviews').upsert(
    [
      {
        reviewer_id: studentA,
        tutor_id: tutorId,
        group_id: group.id,
        session_id: session.id,
        rating: 5,
        comment: 'Great structure and clear explanations.',
        is_verified: true,
      },
      {
        reviewer_id: studentB,
        tutor_id: tutorId,
        group_id: group.id,
        session_id: session.id,
        rating: 4,
        comment: 'Very helpful exam prep tips.',
        is_verified: true,
      },
    ],
    { onConflict: 'reviewer_id,group_id' }
  );

  await supabase.from('notifications').insert([
    {
      user_id: studentA,
      type: 'SESSION_REMINDER',
      title: 'Upcoming session',
      message: 'Your group session starts in 10 minutes.',
      group_id: group.id,
      metadata: { source: 'seed-script' },
    },
    {
      user_id: studentB,
      type: 'SESSION_REMINDER',
      title: 'Upcoming session',
      message: 'Your group session starts in 10 minutes.',
      group_id: group.id,
      metadata: { source: 'seed-script' },
    },
  ]);

  console.log('Group sessions seed complete');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

